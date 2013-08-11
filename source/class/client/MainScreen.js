//
//   Copyright 2009-2013 Ilkka Oksanen <iao@iki.fi>
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing,
//   software distributed under the License is distributed on an "AS
//   IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
//   express or implied.  See the License for the specific language
//   governing permissions and limitations under the License.
//

qx.Class.define('client.MainScreen',
{
    extend : qx.core.Object,

    construct : function(srpc, rootItem, logDialog, settings, infoDialog,
                         anonUser, startLabel)
    {
        this.base(arguments);

        this.windows = [];
        this.rpc = srpc;
        this.logDialog = logDialog;
        this.infoDialog = infoDialog;

        this.__startLabel = startLabel;

        this.settings = settings;
        this.anonUser = anonUser;

        this.__timer = new qx.event.Timer(1000 * 60);
        this.__timer.start();

        this.__topictimer = new qx.event.Timer(1000);

        this.__topictimer.addListener(
            'interval', function(e) {
                //there seems to be bug in qooxdoo, one event can come after the
                //timer is stopped
                if (this.__topictimeractive === true) {
                    if (this.__topicstate === 0) {
                        document.title = '[NEW] MeetAndSpeak';
                        this.__topicstate = 1;
                    } else {
                        document.title = '[MSG] MeetAndSpeak';
                        this.__topicstate = 0;
                    }
                } else {
                    document.title = 'MeetAndSpeak';
                }
            }, this);

        this.__tt = new qx.ui.tooltip.ToolTip('Send Message');
        this.__myapp = rootItem;

        qx.bom.Element.addListener(window, 'focus', function(e) {
            qx.event.Timer.once(function(e){
                document.title = 'MeetAndSpeak';
            }, this, 500);
            this.__blur = 0;

            if (this.__topictimeractive === true) {
                this.__topictimer.stop();
                this.__topictimeractive = false;
            }

            if (this.windows[this.activewin]) {
                this.windows[this.activewin].activatewin();
            }
        }, this);

        qx.bom.Element.addListener(window, 'blur', function(e) {
            this.__blur = 1;
        }, this);

        var soundFormat = 'none';

        //If statement is a hack to prevent running qooxdoo audio code on IE
        //feature detection is missing from Qooxdoo framework

        if (!!document.createElement('audio').canPlayType) {
            var detectAudio = new qx.bom.media.Audio();

            if (detectAudio.canPlayType('audio/mpeg') !== '') {
                soundFormat = 'mp3';
            } else if (detectAudio.canPlayType('audio/ogg') !== '') {
                soundFormat = 'ogg';
            } else if (detectAudio.canPlayType('audio/wave') !== '') {
                soundFormat = 'wav';
            }

            if (soundFormat !== 'none') {
                this.__audio = new qx.bom.media.Audio(
                    'resource/client/new-msg.' + soundFormat);
            }
        }

        client.debug.print('Sound support: ' + soundFormat);
    },

    members :
    {
        manager : 0,
        activewin : 0,
        initdone : 0,
        rootContainer : 0,
        windows : null,
        FlashHelper : 0,
        desktop : 0,
        contactsButton : 0,
        rpc : 0,
        globalflist : 0,

        logDialog : 0,
        infoDialog : 0,
        settings : 0,
        anonUser : 0,
        nicks : 0,
        blocker : 0,

        __statusBar : 0,
        __startLabel : 0,
        __part2 : 0,
        __audio : 0,
        __part3 : 0,
        __windowGroup : 0,
        __myapp : 0,
        __timer : 0,
        __topictimer : 0,
        __topicstate : 0,
        __firstCommand : 1,
        __tt : 0,
        __blur : 0,
        __input1 : 0,
        __topictimeractive : 0,
        __prevwin : -1,
        __msgvisible : 0,

        handleRpcError : function()
        {
            var problemLabel = new qx.ui.basic.Label(
                '<center>MeetAndSpeak is having some technical problems. ' +
                    'Sorry!<br><br>You can try to reload this page in a few ' +
                    'moments to see if the service is back online.<br><br>We ' +
                    'are trying to address the situation as quickly as ' +
                    'possible.</center>').set({
                        font : new qx.bom.Font(14, [ 'Arial', 'sans-serif' ]),
                        width: 500,
                        height: 150,
                        rich: true
                    });

            var marginX = Math.round(qx.bom.Viewport.getWidth() / 2) - 500 / 2;
            var marginY = Math.round(qx.bom.Viewport.getHeight() / 2) - 100;

            problemLabel.setMargin(marginY, 10, 10, marginX);
            this.__myapp.removeAll();
            this.__myapp.add(problemLabel);
        },

        handleError : function(code)
        {

            if (code === 'DIE') {
                if (this.desktop === 0) {
                    this.show();
                }
                this.infoDialog.showInfoWin(
                    'Error',
                    'Session expired. <p>Press OK to login again.',
                    'OK',
                    function () {
                        qx.bom.Cookie.del('ProjectEvergreen');
                        window.location.reload(true);
                    });
            } else if (code ===  'EXPIRE') {
                if (this.desktop === 0) {
                    this.show();
                }

                //var reason = param.slice(pos+1);
                this.infoDialog.showInfoWin(
                    'Error',
                    'Your session expired, you logged in from another ' +
                        'location, or<br>the server was restarted.<p>Press ' +
                        'OK to restart.',
                    'OK',
                    function() {
                        window.location.reload(true);
                    });
            }
        },

        handleCommand : function(message)
        {
            switch(message.id) {
            case 'SESSONID':
                this.rpc.sessionId = message.sessionId;
                break;

            case 'CREATE':
                this.createOrUpdateWindow(message, true);
                break;

            case 'UPDATE':
                this.createOrUpdateWindow(message, false);
                break;

            case 'INITDONE':
                this.initdone = 1;

                for (var i=0; i < this.windows.length; i++) {
                    if (typeof(this.windows[i]) !== 'undefined') {
                        this.windows[i].updateWindowContent();
                    }
                }

                var group = qx.bom.Cookie.get('ProjectEvergreenJoin');

                if (group !== null) {
                    var data = group.split('-');
                    var main = this;

                    qx.bom.Cookie.del('ProjectEvergreenJoin');
                    this.infoDialog.showInfoWin(
                        'Confirm',
                        'Do you want to join the group ' + data[0] + '?', 'Yes',
                        function() {
                            main.rpc.call('JOIN', data[0] + ' MeetAndSpeak ' +
                                          data[1]);
                        }, 'NO');
                }

                this.showMsgWindows();

                if (this.settings.getAutoArrange() === 1) {
                    this.arrangeCommand();
                }

                var infocookie = qx.bom.Cookie.get('msg5');

                if (infocookie === null) {
                    qx.bom.Cookie.set('msg5', 'yes', 1000, '/');
                    // this.infoDialog.showInfoWin('Announcement',
                    // '<b>Hi!</b><p>IRCNet access is again broken.' +
                    // '<br>I estimate that the access will be restored on ' +
                    // 'Monday.<br><br> We are on the mercy of the IRCNet ' +
                    // 'admins<br><br>-Ilkka', 'Okay');
                }
                break;

            case 'ADDTEXT':
                var windowId = message.window;
                var type = message.type;
                var ts = this.adjustTime(message.ts);
                this.windows[windowId].addline(message.type,
                                               message.cat,
                                               message.body,
                                               message.nick,
                                               ts);

                if (this.windows[windowId].sound === 1 &&
                    type === 2 && this.initdone === 1) {
                    if (this.__audio) {
                        this.__audio.setCurrentTime(0);
                        this.__audio.play();
                    }
                }

                if (this.__blur === 1 &&
                    this.windows[windowId].titlealert === 1 &&
                    this.__topictimer.getEnabled() === false &&
                    this.__firstCommand !== 1 &&
                    type === 2) {
                    this.__topictimeractive = true;
                    this.__topictimer.start();
                }

                if (this.activewin.winid !== windowId &&
                    this.initdone === 1) {
                    if (type === 1 && this.windows[windowId].isRed === false) {
                        this.windows[windowId].setGreen();
                    } else if (type === 2) {
                        this.windows[windowId].setRed();
                    }
                    //else don't change color
                }
                break;

            case 'ADDNTF':
                this.windows[message.window].addntf(
                    message.noteId, message.body);
                break;

            case 'REQF':
                var friendId = message.friendId;
                var friendNick = message.friendNick;
                var friendName = message.friendName;

                if (this.__msgvisible === false) {
                    this.msg = new qx.ui.container.Composite(
                        new qx.ui.layout.HBox(8));
                    this.msg.setPadding(5, 15, 5, 15);
                    this.msg.set({ backgroundColor: 'yellow'});

                    this.msg.add(new qx.ui.basic.Label(
                        friendName + ' (' + friendNick +
                            ') wants to be your friend. Is this OK?'));

                    var accept = new qx.ui.basic.Label(
                        '<font color="blue">ACCEPT</font>');
                    var decline = new qx.ui.basic.Label(
                        '<font color="blue">DECLINE</font>');
                    accept.setRich(true);
                    decline.setRich(true);

                    accept.addListener('click', function () {
                        this.rpc.call('OKF', friendId);
                        //TODO: this relies on proper carbage collection
                        this.rootContainer.remove(this.msg);
                        this.__msgvisible = false;
                    }, this);

                    decline.addListener('click', function () {
                        this.rpc.call('NOKF', friendId);
                        //TODO: this relies on proper carbage collection
                        this.rootContainer.remove(this.msg);
                        this.__msgvisible = false;
                    }, this);

                    this.msg.add(accept);
                    this.msg.add(decline);

                    this.__msgvisible = true;

                    this.rootContainer.addAt(this.msg, 1, {flex:0});
                }
                // else ignore command
                break;

            case 'TOPIC':
                this.windows[message.window].changetopic(message.topic);
                break;

            case 'NAMES':
                this.windows[message.window].addnames(message.names);
                break;

            case 'ADDNAME':
                this.windows[message.window].addname(message.nick);
                break;

            case 'DELNAME':
                this.windows[message.window].delname(message.nick);
                break;

            case 'NICK':
                this.nicks = message.nicks;
                break;

            case 'ADDURL':
                this.windows[message.window].addUrl(message.url);
                break;

            case 'INFO' :
                var text = message.text;

                //TODO: big bad hack, fix: proper protocol
                if (text.substr(0, 30) === 'You are already chatting with ') {
                    this.removeWaitText(this.globalflist, text.substr(30));
                }

                this.infoDialog.showInfoWin('Info', text, 'OK');
                break;

            case 'CLOSE':
                //TODO: call destructor?
                delete this.windows[message.window];
                break;

            case 'FLIST':
                this.updateFriendsList(this.globalflist, message);
                break;

            case 'SET':
                this.settings.update(message.settings);
                //We have settings now, ready to draw the main screen
                this.__startLabel.setValue(
                    '<center><br><br><br>Rendering</center>');
                this.show();
                break;

            case 'KEY':
                this.windows[message.window].apikey.setValue(message.key);
                break;

            case 'OPERLIST':
                windowId = message.window;
                this.windows[windowId].configListOper.removeAll();

                for (var i=0; i < message.list.length; i++) {
                    var operList = new qx.ui.form.ListItem(
                        message.list[i].nick);
                    operList.userid = message.list[i].userId;
                    this.windows[windowId].configListOper.add(operList);
                }
                break;

            case 'BANLIST':
                windowId = message.window;
                this.windows[windowId].configListBan.removeAll();

                for (i = 0; i < message.list.length; i++) {
                    var banList = new qx.ui.form.ListItem(message.list[i].info);
                    banList.banid = message.list[i].banId;
                    this.windows[windowId].configListBan.add(banList);
                }
                break;

            case 'LOGS':
                this.logDialog.sendresult(message);
                break;
            }

            this.__firstCommand = 0;
        },

        createOrUpdateWindow : function(message, create)
        {
            var windowId = message.window;
            var x = message.x;
            var y = message.y;
            var width = message.width;
            var height = message.height;
            var nw = message.nwName;
            var nwId = message.nwId;
            var name = message.chanName;
            var type = message.chanType;
            var sound = message.sounds;
            var titlealert = message.titleAlert;
            var usermode = message.userMode;
            var visible = message.visible;
            var newMsgs = message.newMsgs;
            var password = message.password;
            var topic = message.topic;

            if (create === true) {
                var newWindow =
                    new client.UserWindow(this.rpc, this.desktop,
                                          topic, nw, name, type, sound,
                                          titlealert, nwId, usermode, password,
                                          newMsgs, this.infoDialog, windowId,
                                          this);

                if (type !== 0 && this.initdone === 1) {
                    this.removeWaitText(this.globalflist, name);
                }

                if (x < 0) {
                    x = 0;
                }

                if (y < 0) {
                    y = 0;
                }

                if (height === -1) {
                    var myWidth = 0, myHeight = 0;

                    //horror, for some reason getBounds doesn't work for 1st
                    //anon window
                    if (typeof(window.innerWidth) === 'number' ) {
                        //Non-IE
                        myWidth = window.innerWidth;
                        myHeight = window.innerHeight;
                    }
                    else if (document.documentElement &&
                             (document.documentElement.clientWidth ||
                              document.documentElement.clientHeight )) {
                                  //IE 6+ in 'standards compliant mode'
                                  myWidth =
                                      document.documentElement.clientWidth;
                                  myHeight =
                                      document.documentElement.clientHeight;
                              }

                    //anonymous user
                    height = Math.round(myHeight * 0.7);
                    width = Math.round(myWidth * 0.7);
                }

                var dim = this.desktop.getBounds();

                if (dim && x + width > dim.width) {
                    if (width < dim.width) {
                        x = dim.width - width;
                    } else {
                        x = 5;
                        width = dim.width - 10;
                    }
                }

                if (dim && y + height > dim.height) {
                    if (height < dim.height) {
                        y = dim.height - height;
                    } else {
                        y = 5;
                        height = dim.height - 10;
                    }
                }

                newWindow.moveTo(x, y);
                newWindow.setHeight(height);
                newWindow.setWidth(width);

                this.windows[windowId] = newWindow;

                this.addWindowButton(windowId, newMsgs);

                newWindow.show();

                //Keep these two last
                if (visible === 0) {
                    //Qooxdoo bug propably, therefore first show and then hide.
                    newWindow.hide();
                }

                newWindow.addHandlers();

                this.activewin = windowId;
            } else {
                if (this.windows[windowId]) {
                    this.windows[windowId].updateValues(
                        topic, nw, name, type, sound, titlealert,
                        nwId, usermode, password);
                }
            }

            this.windows[windowId].setFonts(this.settings.getLargeFonts());

            if (this.settings.getAutoArrange() === 1 && create === true) {
                this.arrangeCommand();
            }
        },

        adjustTime : function(time)
        {
            var mytime = time - this.rpc.timezone;

            if (mytime < 0) {
                mytime = 1440 + mytime;
            }

            if (mytime > 1440) {
                mytime = mytime - 1440;
            }

            var hour = Math.floor(mytime / 60);
            var min = mytime % 60;

            if (min < 10) {
                min = '0' + min;
            }

            if (hour < 10) {
                hour = '0' + hour;
            }

            return hour + ':' + min;
        },

        show : function()
        {
            // Root widget
            this.rootContainer = new qx.ui.container.Composite(
                new qx.ui.layout.VBox(0));

            this.rootContainer.set({ backgroundColor: '#717172', padding: 0 });

            // middle
            var windowManager = new qx.ui.window.Manager();
            this.manager = windowManager;

            var middleSection = new qx.ui.container.Composite(
                new qx.ui.layout.HBox(0));

            //desktop
            var middleContainer = new qx.ui.window.Desktop(windowManager);

            middleContainer.addListener('resize', this.checkLimits,this);

            this.desktop = middleContainer;
            this.blocker = new qx.ui.core.Blocker(middleContainer);
            this.blocker.setOpacity(0.5);
            this.blocker.setColor('black');

            middleContainer.set({ decorator: 'background2',
                                  backgroundColor: '#DFE5E5' });
            middleSection.add(middleContainer, { flex:1 });

            var friendScroll = new qx.ui.container.Scroll();
            friendScroll.setPadding(0, 0, 5, 0);
            friendScroll.set({ backgroundColor: '#e2e5eE'});

            var friendContainer = new qx.ui.container.Composite(
                new qx.ui.layout.VBox());
            friendContainer.set({ backgroundColor: '#e2e5eE'});

            var friendsLabel = new qx.ui.basic.Label(
                '<b>Contact list:</b>').set({
                    font : new qx.bom.Font(14, ['Arial', 'sans-serif']),
                    textColor: '#cc448b'});

            friendsLabel.setRich(true);
            friendsLabel.setPaddingTop(10);
            friendsLabel.setPaddingBottom(10);
            friendsLabel.setPaddingLeft(10);

            friendContainer.add(friendsLabel);

            var fgrid = new qx.ui.layout.Grid();
            this.globalflist = new qx.ui.container.Composite(fgrid);
            this.globalflist.setAllowGrowY(true);
            this.globalflist.setAllowGrowX(true);
            fgrid.setColumnWidth(0, 185);

            friendContainer.add(this.globalflist, { flex: 1 });

            var addContainer = new qx.ui.container.Composite(
                new qx.ui.layout.HBox());

            this.__input1 = new qx.ui.form.TextField();
            this.__input1.setPlaceholder('<nickname>');
            this.__input1.setMarginTop(10);
            this.__input1.setMarginBottom(8);
            this.__input1.setMarginLeft(8);

            addContainer.add(this.__input1, { flex: 1 });
            addContainer.add(new qx.ui.core.Spacer(8));

            var button1 = new qx.ui.form.Button('Add');
            button1.setMarginTop(10);
            button1.setMarginBottom(8);
            button1.setMarginRight(8);
            addContainer.add(button1);

            friendContainer.add(addContainer);

            button1.addListener('execute', function (e) {
                this.rpc.call('ADDF', this.__input1.getValue());
                this.__input1.setValue('');
            }, this);

            this.rootContainer.add(middleSection, { flex:1 });

            // create the toolbar
            var toolbar = new qx.ui.toolbar.ToolBar();
            toolbar.set({ maxHeight : 40, spacing : 30 });

            // create and add Part 1 to the toolbar
            this.__part2 = new qx.ui.toolbar.Part();
            this.__part3 = new qx.ui.toolbar.Part();

            toolbar.add(this.__part2);
            toolbar.addSpacer();

            //popup
            var contactsPopup = new qx.ui.popup.Popup(new qx.ui.layout.HBox(5));
            contactsPopup.set({ autoHide: true, height: 400, width: 250 });

            friendScroll.add(friendContainer);
            friendScroll.set({ scrollbarX: 'auto', scrollbarY: 'auto' });

            contactsPopup.add(friendScroll, { flex: 1 });

            var menuButton = new qx.ui.toolbar.MenuButton('Menu', null,
                                                          this.getMainMenu());
            this.__part3.add(menuButton);

            if (this.anonUser === false) {
                var contactsButton = new qx.ui.toolbar.CheckBox(
                    '<span style="color:#000000">Contacts...</span>');
                contactsButton.setRich(true);
                this.contactsButton = contactsButton;
                this.__part3.add(contactsButton);

                contactsButton.setValue(false);

                contactsButton.addListener('changeValue', function (e) {
                    if (e.getData() === true &&
                        this.contactsButton.getValue() === true) {
                        contactsPopup.placeToWidget(contactsButton);
                        contactsPopup.show();
                    }
                }, this);

                contactsPopup.addListener('disappear', function (e) {
                    contactsButton.setValue(false);
                });

                this.__timer.addListener(
                    'interval', function(e) { this.updateIdleTimes(
                        this.globalflist); },
                    this);

                toolbar.add(this.__part3);
            }

            this.rootContainer.add(toolbar);
            this.__myapp.add(this.rootContainer,
                             { width: '100%', height: '100%' });
                             //, {padding : 10});

            //Status bar
            this.__statusBar = new qx.ui.basic.Label('');
            this.__statusBar.set({ backgroundColor: '#ff0000',
                                   zIndex: 100,
                                   textColor: '#ffffff',
                                   font: new qx.bom.Font(23, ['Arial',
                                                               'sans-serif']),
                                   padding: 14});
            this.__statusBar.hide();
            this.__myapp.add(this.__statusBar, { left: 100, top: 0 });

            this.__windowGroup = new client.RadioManager();
        },

        updateFriendsList : function(parentFList, message)
        {
            parentFList.removeAll();

            if (message.list.length !== 0) {
                for (var i = 0; i < message.list.length; i++) {
                    var friendData = message.list[i];

                    var friend = new qx.ui.basic.Label(
                        '<b>' + friendData.name + '</b>&nbsp;(' +
                            friendData.nick + ')');
                    var friend2 = new qx.ui.basic.Label();
                    var friend3 = new qx.ui.basic.Label();

                    friend3.setRich(true);
                    friend3.setValue('<font color="green">|chat|</font>');
                    friend3.nickname = friendData.nick;
                    friend3.rrpc = this.rpc;
                    friend3.waiting = false;
                    friend3.mainscreen = this;

                    friend3.addListener('click', function (e) {
                        this.rrpc.call('STARTCHAT', 'MeetAndSpeak ' +
                                       this.nickname);
                        this.setValue('<font color="green">Wait..</font>');
                        this.waiting = true;
                    }, friend3);

                    friend3.addListener('mouseover', function (e) {
                        if (this.waiting === false) {
                            this.setValue(
                                '<font color="green"><u>|chat|<u></font>');
                        }
                    }, friend3);

                    friend3.addListener('mouseout', function (e) {
                        if (this.waiting === false) {
                            this.setValue('<font color="green">|chat|</font>');
                        }
                    }, friend3);

                    friend3.setToolTip(this.__tt);

                    friend2.setRich(true);
                    friend.setRich(true);

                    friend.setPaddingTop(7);
                    friend3.setPaddingTop(7);

                    friend2.setPaddingTop(0);
                    friend2.setPaddingLeft(20);
                    friend3.setPaddingLeft(10);
                    friend.setPaddingLeft(10);
                    friend2.idleTime = friendData.idleTime;

                    parentFList.add(friend, { row: 2*i, column: 0 });
                    parentFList.add(friend2, { row: 2 * i + 1, column: 0,
                                               colSpan : 2 });
                    parentFList.add(friend3, { row: 2 * i, column: 1 });

                    var online = 2;

                    if(friendData.idleTime === 0) {
                        online = 1;
                    }

                    //update groups also
                    for (var ii=0; ii < this.windows.length; ii++) {
                        if (typeof(this.windows[ii]) !== 'undefined') {
                            this.windows[ii].setUserStatus(friendData.nick,
                                                           online);
                        }
                    }
                }
            } else {
                var nofriends = new qx.ui.basic.Label(
                    'No friends added<p>You can add new contacts by<br> using' +
                        'the field below<br>or by right-clicking <br>a name ' +
                        'in any group window.<p>You can send messages <br>' +
                        'and see status information<br> of your friends.');
                nofriends.setRich(true);

                nofriends.setPaddingLeft(10);
                parentFList.add(nofriends, { row: 0, column: 0 });
            }

            this.printIdleTimes(parentFList);
        },

        expandMOTD : function()
        {
            this.windows[this.activewin].expandMOTD();
        },

        printIdleTimes : function(parentFList)
        {
            var children = parentFList.getChildren();
            var online = 0;

            for (var i = 1; i < children.length; i = i + 3) {
                var idle = children[i].idleTime;
                var result;

                if (idle === 0) {
                    result = '<font color="green">ONLINE<font>';
                    online++;
                } else if (idle < 60) {
                    result = '<font color="blue">Last&nbsp;activity:&nbsp;' +
                        idle + '&nbsp;mins&nbsp;ago</font>';
                } else if (idle < 60 * 24) {
                    idle = Math.round(idle / 60);
                    if (idle === 0) {
                        idle = 1;
                    }

                    result = '<font color="blue">Last&nbsp;activity:&nbsp;' +
                        idle + '&nbsp;hours&nbsp;ago</font>';
                } else if (idle < 5000000) {
                    idle = Math.round(idle / 60 / 24);
                    if (idle === 0)
                    {
                        idle = 1;
                    }

                    result = '<font color="blue">Last&nbsp;activity:&nbsp;' +
                        idle + '&nbsp;days&nbsp;ago</font>';
                } else {
                    result = '<font color="blue">Last&nbsp;activity:</font>' +
                        '&nbsp;Unknown';
                }

                children[i].setValue(result);
            }

            var onlineText = '';

            if (online > 0) {
                onlineText = '<span style="color:#000000">(</span>' +
                    '<span style="color:#254117">' + online +
                    '</span><span style="color:#000000">)</span>';
            }

            this.contactsButton.setLabel(
                '<span style="color:#000000">Contacts...</span> ' +
                    onlineText);
        },

        checkLimits : function(e)
        {
            for (var i = 0; i < this.windows.length; i++) {
                if (typeof(this.windows[i]) !== 'undefined') {
                    var wbounds = this.windows[i].getBounds();
                    var dim = e.getData();
                    var x = wbounds.left;
                    var y = wbounds.top;
                    var width = wbounds.width;
                    var height = wbounds.height;

                    if (x + width > dim.width) {
                        if (width < dim.width) {
                            x = dim.width - width;
                        } else {
                            x = 5;
                            width = dim.width - 10;
                        }
                    }

                    if (y + height > dim.height) {
                        if (height < dim.height) {
                            y = dim.height - height;
                        } else {
                            y = 5;
                            height = dim.height - 10;
                        }
                    }

                    if (x !== wbounds.left || y !== wbounds.top) {
                        this.windows[i].moveTo(x, y);
                    }

                    if (width !== wbounds.width) {
                        this.windows[i].setWidth(width);
                    }

                    if  (height !== wbounds.height) {
                        this.windows[i].setHeight(height);
                    }
                }
            }
        },

        updateIdleTimes : function(parentFList)
        {
            var children = parentFList.getChildren();

            for (var i = 0; i < children.length; i++) {
                if (children[i].idleTime !== 0) {
                    children[i].idleTime++;
                }
            }

            this.printIdleTimes(parentFList);
        },

        removeWaitText : function(parentFList, nick)
        {
            if (!parentFList) {
                return;
            }

            var children = parentFList.getChildren();

            for (var i = 2; i < children.length; i = i + 3) {
                if (children[i].nickname === nick) {
                    children[i].setValue('<font color="green">|chat|</font>');
                }
            }
        },

        removeWindowButton : function(winid)
        {
            if (this.windows[winid]) {
                this.__windowGroup.remove(this.windows[winid].taskbarControl);
                this.__part2.remove(this.windows[winid].taskbarButton);
            }
        },

        addWindowButton : function(winid, newMsgs)
        {
            if (this.windows[winid]) {
                var item = new qx.ui.toolbar.RadioButton();
                item.winid = winid;
                item.mainscreenobj = this;

                item.addListener('execute', function () {
                    this.windows[winid].setNormal();

                    if (winid !== this.__prevwin) {
                        this.switchToWindow(winid);
                    } else if (winid === this.__prevwin &&
                               this.windows[winid].hidden === true) {
                        this.windows[winid].show();
                    } else if (winid === this.__prevwin) {
                        this.windows[winid].hide();
                    }
                    this.__prevwin = winid;
                }, this);

                // Link from window object to its taskbarbutton.
                this.windows[winid].taskbarButton = item;
                this.windows[winid].taskbarControl = this.__windowGroup;
                item.setRich(true);
                item.setMarginLeft(0);
                item.setMarginRight(-3);

                this.__part2.add(item);
                this.__windowGroup.add(item);
                this.__windowGroup.setSelection([item]);

                if (newMsgs === 1) {
                    this.windows[winid].setGreen();
                } else if (newMsgs === 2) {
                    this.windows[winid].setRed();
                } else if (newMsgs === 0) {
                    this.windows[winid].setNormal();
                }
            }

            this.activewin = winid;
            this.windows[winid].activatewin();
        },

        activateNextWin : function(direction)
        {
            var i = 0; // agains bugs
            var cur = 0;
            var previous = this.activewin;

            do {
                if (direction === 'up') {
                    this.__windowGroup.selectNext();
                } else {
                    this.__windowGroup.selectPrevious();
                }
                i++;
                cur = this.__windowGroup.getSelection()[0].winid;
            } while (i !== 30 && this.windows[cur].hidden === true);

            if (cur !== previous) {
                this.__windowGroup.getSelection()[0].execute();
            }
        },

        switchToWindow : function(e)
        {
            if (this.windows[e]) {
                this.windows[e].show();
                this.windows[e].setNormal();
                this.activewin = e;
                this.windows[e].activatewin();
            }
        },

        getMainMenu : function()
        {
            var menu = new qx.ui.menu.Menu();

            var forumMenu = new qx.ui.menu.Button('Groups', null, null,
                                                     this.getForumMenu());
            var viewMenu = new qx.ui.menu.Button('View', null, null,
                                                    this.getViewMenu());
            var settingsMenu = new qx.ui.menu.Button('Settings', null, null,
                                                    this.getSettingsMenu());
            var advancedMenu = new qx.ui.menu.Button('Advanced', null, null,
                                                        this.getAdvancedMenu());
            var helpMenu = new qx.ui.menu.Button('Help', null, null,
                                                 this.getHelpMenu());
            var logoutMenu = new qx.ui.menu.Button('Log Out', null, null,
                                                      this.getLogoutMenu());

            if (this.anonUser === false) {
                menu.add(forumMenu);
            }

            menu.add(viewMenu);
            menu.add(settingsMenu);

            if (this.anonUser === false) {
                menu.add(advancedMenu);
            }

            menu.add(helpMenu);
            menu.add(logoutMenu);

            return menu;
        },

        setStatusText : function(text)
        {
            if (text === '') {
                this.__statusBar.hide();
            } else {
                this.__statusBar.setValue(text);
                this.__statusBar.show();
            }
        },

        getLogoutMenu : function()
        {
            var menu = new qx.ui.menu.Menu();
            var logoutButton = new qx.ui.menu.Button('Log out');
            menu.add(logoutButton);
            logoutButton.addListener('execute', this._logoutCommand, this);

            return menu;
        },

        getHelpMenu : function()
        {
            var menu = new qx.ui.menu.Menu();
            var manualButton = new qx.ui.menu.Button('Support Web site');
            var keyButton = new qx.ui.menu.Button(
                'Keyboard commands and shortcuts...');
            var aboutButton = new qx.ui.menu.Button('About...');

            manualButton.addListener('execute', this._manualCommand, this);
            aboutButton.addListener('execute', this._aboutCommand, this);
            keyButton.addListener('execute', this._keyCommand, this);

            menu.add(manualButton);
            menu.add(keyButton);
            menu.addSeparator();
            menu.add(aboutButton);

            return menu;
        },

        getForumMenu : function()
        {
            var menu = new qx.ui.menu.Menu();
            var createButton = new qx.ui.menu.Button('Create new group...');
            var joinButton = new qx.ui.menu.Button('Join existing group...');

            createButton.addListener('execute', this._createForumCommand, this);
            joinButton.addListener('execute', this._joinForumCommand, this);

            menu.add(createButton);
            menu.add(joinButton);

            return menu;
        },

        getViewMenu : function()
        {
            var menu = new qx.ui.menu.Menu();
            var logsButton = new qx.ui.menu.Button('Show logs...');
            var arrangeButton = new qx.ui.menu.Button('Arrange windows');

            logsButton.addListener('execute', this._logsCommand, this);
            arrangeButton.addListener('execute', this.arrangeCommand, this);

            if (this.anonUser === false) {
                menu.add(logsButton);
            }
            menu.add(arrangeButton);

            return menu;
        },

        getSettingsMenu : function()
        {
            var menu = new qx.ui.menu.Menu();
            var sslButton = new qx.ui.menu.CheckBox('Always use HTTPS');
            var fontButton = new qx.ui.menu.CheckBox('Small font');
            var arrangeButton = new qx.ui.menu.CheckBox(
                'Auto-arrange windows at startup');

            if (this.settings.getSslEnabled() === 1) {
                sslButton.setValue(true);
            }
            if (this.settings.getLargeFonts() === '0') {
                fontButton.setValue(true);
            }
            if (this.settings.getAutoArrange() === 1) {
                arrangeButton.setValue(true);
            }

            sslButton.addListener('changeValue', this._sslCommand, this);
            fontButton.addListener('changeValue', this._fontCommand, this);
            arrangeButton.addListener('changeValue', this._autoArrangeCommand,
                                      this);

            if (this.anonUser === false) {
                menu.add(sslButton);
            }
            menu.add(fontButton);
            menu.add(arrangeButton);

            return menu;
        },

        getAdvancedMenu : function()
        {
            var menu = new qx.ui.menu.Menu();
            var joinButton = new qx.ui.menu.Button('Join IRC channel...');

            joinButton.addListener('execute', this._joinIRCCommand, this);
            menu.add(joinButton);

            return menu;
        },

        _joinIRCCommand : function()
        {
            this.infoDialog.getJoinNewChannelWin(this.__myapp, 1);
        },

        _logsCommand : function()
        {
            this.logDialog.show(this.__myapp, this.desktop.getBounds());
        },

        _joinForumCommand : function()
        {
            this.infoDialog.getJoinNewChannelWin(this.__myapp, 0);
        },

        _createForumCommand : function()
        {
            this.infoDialog.getCreateNewGroupWin(this.__myapp, 0);
        },

        arrangeCommand : function()
        {
            var x=[0,1,2,3,2,3,3,3,3,3,4,4,4,4,4,4,4];
            var y=[0,1,1,1,2,2,2,3,3,3,3,3,4,4,4,4,4];
            var amount = 0;

            this.blocker.block();

            qx.event.Timer.once(function(e){
                for (var i = 0; i < this.windows.length; i++) {
                    if (typeof(this.windows[i]) !== 'undefined' &&
                        this.windows[i].hidden === false) {
                        amount++;
                    }
                }

                var dim = this.desktop.getBounds();

                if (!dim || amount === 0 || amount > 16) {
                    // !dim is ???
                    this.blocker.unblock();
                    client.debug.print('unkown dim');
                    return;
                }

                var width = Math.floor((dim.width - (3 * (x[amount] + 1))) /
                                       x[amount]);
                var height = Math.floor(((dim.height - 10) -
                                         (3 * (y[amount] + 1))) / y[amount]);

                var cx = 0;
                var cy = 0;
                var current = 0;

                for (i = 0; i < this.windows.length; i++) {
                    if (typeof(this.windows[i]) !== 'undefined' &&
                        this.windows[i].hidden === false) {
                        current++;

                        this.windows[i].moveTo(3 * (cx + 1) + cx * width, 3 *
                                               (cy + 1) + cy * height + 5);
                        this.windows[i].setHeight(height);

                        if (current === amount) {
                            var missing = x[amount] * y[amount] - amount;
                            width = width + missing * width + 3 * missing;
                        }

                        this.windows[i].setWidth(width);
                        this.windows[i].scrollToBottom();
                        cx++;

                        if (cx === x[amount]) {
                            cx = 0;
                            cy++;
                        }
                    }
                }

                this.blocker.unblock();
            }, this, 10);
        },

        _sslCommand : function(e)
        {
            var usessl = e.getData();

            if (usessl === true) {
                this.settings.setSslEnabled(1);
                qx.bom.Cookie.set('UseSSL', 'yes', 100, '/');
            } else {
                this.settings.setSslEnabled(0);
                qx.bom.Cookie.set('UseSSL', 'no', 100, '/');
            }

            this.infoDialog.showInfoWin(
                'Info',
                'The application is now being reloaded to activate<br> the ' +
                    'change.',
                'OK',
                function() {
                    window.location.reload(true);
                });
        },

        _fontCommand : function(e)
        {
            var smallfonts = e.getData();

            if (smallfonts === true) {
                this.settings.setLargeFonts('0');
            } else {
                this.settings.setLargeFonts('1');
            }

            this.updateFonts();
        },

        _autoArrangeCommand : function(e)
        {
            var autoarrange = e.getData();

            if (autoarrange === true) {
                this.settings.setAutoArrange(1);
            } else {
                this.settings.setAutoArrange(0);
            }
        },

        updateFonts : function()
        {
            for (var i = 0; i < this.windows.length; i++) {
                if (typeof(this.windows[i]) !== 'undefined') {
                    this.windows[i].setFonts(this.settings.getLargeFonts());
                }
            }
        },

        showMsgWindows : function()
        {
            for (var i = 0; i < this.windows.length; i++) {
                if (typeof(this.windows[i]) !== 'undefined' &&
                    this.windows[i].type === 1) {
                    this.manager.bringToFront(this.windows[i].window);
                }
            }
        },

        _logoutCommand : function()
        {
            this.rpc.call('LOGOUT', '');

            //TODO: create LOGOUTOK response and move this to there:
            qx.event.Timer.once(function(e) {
                qx.bom.Cookie.del('ProjectEvergreen');
                window.location.reload(true);
            }, this, 1500);
        },

        _manualCommand : function()
        {
            var newWindow = window.open('/support.html', '_blank');
            newWindow.focus();
        },

        _aboutCommand : function()
        {
            this.infoDialog.showInfoWin(
                'About',
                '<br><br><br><center><img src="/i/mas_logo_small.png">' +
                    '</center><p><b><br><br><center><h2 style="color: ' +
                    '#000022;">MeetAndSpeak Web Client</center></h2></b>' +
                    '<p><center>Version: __MOE_VERSION__</center><br>' +
                    '<p style="padding-bottom:1px;">&copy; 2010-2012 ' +
                    '<a href="/about.html">MeetAndSpeak Ltd</a>. All ' +
                    'rights reserved.</p><br><br>', 'OK');
        },

        _keyCommand : function()
        {
            this.infoDialog.showInfoWin(
                'Shortcuts',
                '<b>Keyboard shortcuts:</b><p><table border=0><tr><td>' +
                    '[TAB]</td><td>= nick name completion</td></tr><tr><td>' +
                    '[Arrow Up]</td><td>= Switch to next visible window</td>' +
                    '</tr><tr><td>[Arrow Down]</td><td>= Switch to previous ' +
                    'visible windows</td></tr></table><p>To send a ' +
                    'notification to others in the group, start your line<br>' +
                    'with an exclamation mark "!" followed by a space ' +
                    'character. You can delete received<br>notifications ' +
                    'whenever you like by double-clicking them.<p>' +
                    'Notifications are handy as they stay always visible. ' +
                    'You can<br>be sure that everyone will see them.<p>' +
                    'See other available commands by typing<br>"/help" in ' +
                    'any of the windows.', 'OK');
        }
    }
});
