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

qx.Class.define('mas.InfoDialog',
{
    extend : qx.core.Object,

    construct : function(srpc, settings)
    {
        this.base(arguments);

        this.__rpc = srpc;
        this.__settings = settings;

        this.__window = new qx.ui.window.Window().set({
            contentPadding: [13, 13, 13, 13],
            modal: true,
            showClose: false,
            showMinimize: false,
            showMaximize: false
        });

        this.__window.setLayout(new qx.ui.layout.VBox(10));
        this.__window.moveTo(400, 300);

        this.__message = new qx.ui.basic.Atom();
        this.__message.setRich(true);

        this.__message2 = new qx.ui.basic.Atom();
        this.__message2.setRich(true);

        this.__message3 = new qx.ui.basic.Atom();
        this.__message3.setRich(true);

        this.__message4 = new qx.ui.form.CheckBox('Don\'t show again');

        this.__box = new qx.ui.container.Composite();
        this.__box.setLayout(new qx.ui.layout.HBox(10, 'left'));
        this.__spacer = new qx.ui.core.Spacer(30);
        this.__combo = new qx.ui.form.ComboBox();

        this.__box2 = new qx.ui.container.Composite();
        this.__box2.setLayout(new qx.ui.layout.HBox(10, 'left'));

        this.__yesbutton = new qx.ui.form.Button('Yes');
        this.__nobutton = new qx.ui.form.Button('No');

        this.__input = new qx.ui.form.TextField().set({
            maxLength: 25
        });

        this.__input2 = new qx.ui.form.TextField().set({
            maxLength: 25
        });
    },

    members :
    {
        __rpc : 0,
        __settings : 0,
        __window : 0,
        __message : 0,
        __message2 : 0,
        __message3 : 0,
        __message4 : 0,
        __spacer : 0,
        __box : 0,
        __box2 : 0,
        __yesbutton : 0,
        __nobutton : 0,
        __yeslistenerid : 0,
        __nolistenerid : 0,
        __inputlistenerid : 0,
        __input2listenerid : 0,
        __input : 0,
        __input2 : 0,
        __combo : 0,
        __nwselection : 'MeetAndSpeak',
        __winvisible : 0,
        __queue : [],

        showInfoWin : function(topic, text, showOk, callbackOk, showNo,
                               callbackNo, alllowAvoid)
        {
            if (this.__winvisible === 1) {
                var obj = {};
                obj.topic = topic;
                obj.text = text;
                obj.showOk = showOk;
                obj.callbackOk = callbackOk;
                obj.showNo = showNo;
                obj.callbackNo = callbackNo;

                this.__queue.push(obj);
                return;
            }

            this.__winvisible = 1;
            this.__window.removeAll();
            this.__box.removeAll();
            this.__window.add(this.__message);

            this.__message.setLabel(text);
            this.__window.setCaption(topic);

            this.__window.add(this.__box);

            if (alllowAvoid === true) {
                this.__box.add(this.__message4);
                this.__message4.setValue(false);
            }

            this.__box.add(this.__spacer, { flex: 1 });

            if (typeof(showOk) !== 'undefined') {
                this.__yesbutton.setLabel(showOk);
                this.__box.add(this.__yesbutton);

                if (this.__yeslistenerid !== 0) {
                    this.__yesbutton.removeListenerById(this.__yeslistenerid);
                }

                this.__yeslistenerid = this.__yesbutton.addListener(
                    'execute', function() {
                        if (typeof(callbackOk) !== 'undefined') {
                            callbackOk();
                        }

                        if (this.__message4.getValue() === true) {
                            this.settings.setShowCloseWarn(0);
                        }

                    this.closeInfoWindow();
                }, this);
            }

            if (typeof(showNo) !== 'undefined') {
                this.__nobutton.setLabel(showNo);
                this.__box.add(this.__nobutton);

                if (this.__nolistenerid !== 0) {
                    this.__nobutton.removeListenerById(this.__nolistenerid);
                }

                this.__nolistenerid = this.__nobutton.addListener(
                    'execute', function() {
                        if (typeof(callbackNo) !== 'undefined') {
                            callbackNo();
                        }

                        if (this.__message4.getValue() === true) {
                            this.settings.setShowCloseWarn(0);
                        }

                        this.closeInfoWindow();
                    }, this);
            }

            this.__window.setModal(true);
            this.__window.open();
            this.__window.center();
        },

        closeInfoWindow : function ()
        {
            this.__window.close();
            this.__winvisible = 0;

            if (this.__queue.length > 0) {
                var obj = this.__queue.shift();
                this.showInfoWin(obj.topic, obj.text, obj.showOk,
                                 obj.callbackOk, obj.showNo, obj.callbackNo);
            }
        },

        getJoinNewChannelWin : function(rootItem, mode)
        {
            this.__window.removeAll();
            this.__box.removeAll();

            this.__window.add(this.__message);

            if (mode === 0) {
                this.__window.setCaption('Join existing group');
                this.__message.setLabel(
                    'Type the name of the group you wish to join:');
            } else {
                this.__window.setCaption('Join IRC channel');
                this.__message.setLabel(
                    'Type the name of the IRC channel you wish to join:');
            }

            this.__input.setValue('');
            this.__window.add(this.__input);

            this.__message3.setLabel('Password, if needed:');
            this.__window.add(this.__message3);

            this.__input2.setValue('');
            this.__window.add(this.__input2);

            this.__window.add(this.__box2);
            this.__window.add(this.__box);

            this.__box.removeAll();
            this.__box2.removeAll();

            this.__box.add(this.__spacer, { flex: 1 });
            this.__yesbutton.setLabel('OK');
            this.__box.add(this.__yesbutton);
            this.__nobutton.setLabel('Cancel');
            this.__box.add(this.__nobutton);

            if (mode === 1) {
                this.__message2.setLabel('Network:');

                this.__combo.removeAll();
                //TODO: configuration system needed, now UPDATE THIS manually!
                this.__combo.add(new qx.ui.form.ListItem('IRCNet'));
                this.__combo.add(new qx.ui.form.ListItem('FreeNode'));
                this.__combo.add(new qx.ui.form.ListItem('W3C'));

                this.__combo.setValue('IRCNet');
                this.__nwselection = 'IRCNet';

                this.__combo.addListener('changeValue', function(e) {
                    this.__nwselection = e.getData();
                }, this);

                this.__box2.add(this.__message2);
                this.__box2.add(this.__combo);
            } else {
                this.__nwselection = 'MeetAndSpeak';
            }

            if (this.__nolistenerid !== 0) {
                this.__nobutton.removeListenerById(this.__nolistenerid);
            }

            this.__nolistenerid = this.__nobutton.addListener(
                'execute', function() {
                    this.__window.close();
                }, this);

            if (this.__yeslistenerid !== 0) {
                this.__yesbutton.removeListenerById(this.__yeslistenerid);
            }

            this.__yeslistenerid = this.__yesbutton.addListener(
                'execute', function() {
                    var input = this.__input.getValue();

                    if (input !== '') {
                        this.__rpc.call('JOIN', input + ' ' + this.__nwselection +
                                      ' ' + this.__input2.getValue());
                    }

                    this.__window.close();
                }, this);

            rootItem.add(this.__window);
            this.__window.open();
            this.__input.focus();
            this.__window.center();
        },

        getCreateNewGroupWin : function(rootItem)
        {
            this.__window.removeAll();
            this.__box.removeAll();

            this.__window.setCaption('Create new group');
            this.__message.setLabel(
                'Type the name of the group you wish to create:');
            this.__message2.setLabel('Password (optional):');

            this.__window.add(this.__message);
            this.__input.setValue('');
            this.__window.add(this.__input);

            this.__window.add(this.__message2);
            this.__window.add(this.__input2);

            this.__window.add(this.__box2);
            this.__window.add(this.__box);

            this.__box.removeAll();
            this.__box2.removeAll();

            this.__box.add(this.__spacer, {flex: 1});
            this.__yesbutton.setLabel('OK');
            this.__box.add(this.__yesbutton);
            this.__nobutton.setLabel('Cancel');
            this.__box.add(this.__nobutton);


            if (this.__nolistenerid !== 0) {
                this.__nobutton.removeListenerById(this.__nolistenerid);
            }

            this.__nolistenerid = this.__nobutton.addListener(
                'execute', function() {
                    this.__window.close();
                }, this);

            if (this.__yeslistenerid !== 0) {
                this.__yesbutton.removeListenerById(this.__yeslistenerid);
            }

            this.__yeslistenerid = this.__yesbutton.addListener(
                'execute', function() {
                    this.__process();
                }, this);

            if (this.__inputlistenerid !== 0) {
                this.__input.removeListenerById(this.__inputlistenerid);
            }


            if (this.__input2listenerid !== 0) {
                this.__input2.removeListenerById(this.__input2listenerid);
            }

            this.__inputlistenerid = this.__input.addListener(
                'keypress', function(e) {
                    if (e.getKeyIdentifier() === 'Enter')
                    {
                        this.__process();
                    }
                }, this);

            this.__input2listenerid = this.__input2.addListener(
                'keypress', function(e) {
                    if (e.getKeyIdentifier() === 'Enter') {
                        this.__process();
                    }
            }, this);

            rootItem.add(this.__window);

            this.__window.open();
            this.__input.focus();
            this.__window.center();
        },

        __process : function()
        {
            var input = this.__input.getValue();
            var input2 = this.__input2.getValue();

            if (input !== '') {
                this.__rpc.call('CREATE', input + ' ' + input2);
            }
            this.__window.close();
        }
    }
});
