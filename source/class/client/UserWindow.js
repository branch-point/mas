/* ************************************************************************

#asset(projectx/*)
5B5B#require(qx.util.StringSplit)

************************************************************************ */

qx.Class.define("client.UserWindow",
{
    extend : qx.core.Object,

    construct : function(desktop, topic, nw, name, type, sound, nw_id, usermode, password)
    {
	this.base(arguments);

	// write "socket"
	this.__srpc = new qx.io.remote.Rpc(
	    ralph_url + "/",
	    "ralph"
	);
	this.__srpc.setTimeout(10000);

	var layout = new qx.ui.layout.Grid();
	layout.setRowFlex(0, 1); // make row 0 flexible
	layout.setColumnFlex(0, 1); // make column 0 flexible
	layout.setColumnWidth(1, 100); // set with of column 1 to 200 pixel
	layout.setColumnAlign(1, "center", "middle");

	var wm1 = new qx.ui.window.Window();
	wm1.userWindowRef = this;

	this.__nw = nw;
	this.__nw_id = nw_id;
	this.sound = sound;
	this.__usermode = usermode;
	this.__password = password;

	wm1.setLayout(layout);
	wm1.setModal(false);
	wm1.setAllowMaximize(true);
	wm1.moveTo(250, 150);
	
	// create scroll container
	this.__scroll = new qx.ui.container.Scroll();

	this.__scroll.set({
	    minWidth: 100,
	    minHeight: 50,
	    scrollbarY : "on"
	});

	var channelText = "Ready.<br>";
	
	this.__atom = new qx.ui.basic.Atom(channelText);
	this.__atom.setRich(true);
	
	this.__scroll.add(this.__atom);		       
	wm1.add(this.__scroll, {row: 0, column: 0, flex: 1});
	
	this.__input1 = new qx.ui.form.TextField();
	this.__input1.set({ maxLength: 200 });
	this.__input1.setMarginTop(2);
	this.__input1.focus();

	this.__input1.addListener("keypress", function(e) {
	    if (e.getKeyIdentifier() == "Enter")
	    {
		var input = this.__input1.getValue();
	    
		if (input !== "")
		{
		    this.__srpc.callAsync(
			this.sendresult,
			"SEND", global_id + " " + global_sec +
			    " " + this.winid + " " + input);
		    this.__input1.setValue("");

		    var currentTime = new Date();
		    var hour = currentTime.getHours();
		    var min = currentTime.getMinutes();

		    if (min < 10)
		    {
			min = "0" + min;
		    }

		    if (hour < 10)
		    {
			hour = "0" + hour;
		    }
		 
		    var mynick = " <font color=\"blue\"><b>&lt;" +
			global_nick[this.__nw_id] + "&gt;</b> ";

		    if (input.substr(0,4) == "/me ")
		    {
			input = input.substr(4);
			mynick = " <font color=\"blue\"><b>* " +
			    global_nick[this.__nw_id] + "</b> ";
		    }

		    {
			this.addline(hour + ":" + min + mynick + input + "</font><br>");
		    }
		}
	    }
	}, this);

	wm1.add(this.__input1, {row: 1, column: 0});

	this.prefButton = new qx.ui.form.ToggleButton("Settings");
	this.prefButton.setMargin(2,10,2,10);

	this.prefButton.addListener("changeValue", function(e) {
	    if (e.getData() == true)
	    {
		this.__settingsmode = 1;
		if (this.__settings == 0)
		{
		    this.__settings = this.getSettingsView();		    
		}
		this.topicInput.setValue(this.__topic);
		this.pwInput.setValue(this.__password);

		wm1.remove(this.__scroll);
		wm1.remove(this.__list);
		wm1.add(this.__settings, {row : 0, column : 0, colSpan : 2});
	    }
	    else
	    {
		this.__settingsmode = 0;
		if (this.__settings != 0)
		{
		    wm1.remove(this.__settings);
		}

		wm1.add(this.__scroll, { row:0, column :0});
		wm1.add(this.__list, { row:0, column :1});
	    }
	}, this);

	if (type == 0)
	{
	    wm1.add(this.getList(), {row: 0, column: 1, rowSpan: 1, flex:1});
	    wm1.add(this.prefButton, {row: 1, column: 1});
	}

	this.__window = wm1;
	this.__type = type;
	this.__name = name;

	this.__window.addListener("close", this.handleClose, this);

	desktop.add(wm1);

	this.changetopic(topic);
    },

    //TODO: write proper destructor
    members :
    {
        __window : 0,
	__input1 : 0,
	__list : 0,
	__atom : 0,
	__channelText : "",
	__scroll : 0,
	__srpc : 0,
	__lines : 0,
	__settings : 0,
	__settingsmode : 0,
	winid : 0,
	__nw : 0,
	__nw_id : 0,
	__type : 0,
	__name : 0,
	taskbarControl : 0,

	updateValues : function(topic, nw, name, type, sound, nw_id, usermode, password)
	{
	    this.__password = password;
	    this.__usermode = usermode;
	    this.__topic = topic;

	    if (this.__settingsmode == 1)
	    {
		//realtime update
		this.topicInput.setValue(this.__topic);
		this.pwInput.setValue(this.__password);
	    }
	},
	
	handleResize : function(e) 
	{
	    var data = e.getData();
	    var width = data.width;
	    var height = data.height;

	    if (MainScreenObj.initdone == 1)
	    {
		this.__srpc.callAsync(this.sendresult,
				      "RESIZE", global_id + " " + global_sec + " " + this.winid + " " +
				      width + " " + height);
	    }
	},

	handleClose : function(e)
	{
	    this.__srpc.callAsync(this.sendresult,
				  "CLOSE", global_id + " " + global_sec + " " + this.winid);
	},

	//TODO: handle beforeclose -> remove from mainscreen array

	setHeight : function(e)
	{
	    this.__window.setHeight(e);
	},

	setWidth : function(e)
	{
	    this.__window.setWidth(e);
	},

	getBounds : function()
	{
	    return this.__window.getBounds();
	},

	setRed : function()
	{
	    var name = this.getName();

	    if (this.__type == 0)
	    {
		name = name.substr(1);
	    }

	    name = name.substr(0, 1).toUpperCase() + name.substr(1);

	    this.taskbarButton.setLabel("<font color=\"red\">" + name +
					"</font>");
	},

	setNormal : function()
	{ 
	    var name = this.getName();

	    if (this.__type == 0)
	    {
		name = name.substr(1)
	    }

	    name = name.substr(0, 1).toUpperCase() + name.substr(1);

	    this.taskbarButton.setLabel("<font color=\"blue\">" + name +
					"</font>");
	},

	handleMove : function(e)
	{
	    var data = e.getData();
	    var x = data.left;
	    var y = data.top;

	    if (MainScreenObj.initdone == 1)
	    {

		this.__srpc.callAsync(this.sendresult,
				      "MOVE", global_id + " " + global_sec + " " + this.winid + " " +
				      x + " " + y);
	    }
	},

	activatewin : function()
	{
	    if (this.__settingsmode == 0)
	    {
		this.__input1.focus();
	    }
	},

	sendresult : function(result, exc) 
	{
	    MainScreenObj.sendresult(result, exc);
	},

	addHandlers : function()
	{
	    this.__window.addListener('resize', this.handleResize, this);
	    this.__window.addListener('move', this.handleMove, this);

	    this.__window.addListener('click', function(e) {

		if (this.taskbarControl)
		{
		    if (!this.taskbarButton)
		    {
			alert("ueueu");
		    }

		    this.taskbarControl.setSelection([this.taskbarButton]);
		}
		this.activatewin();
		MainScreenObj.activewin = this.winid;
	    }, this);

	},

	moveTo : function(x,y)
	{
	    this.__window.moveTo(x, y);
	},

	show : function()
	{
	    this.__window.open();
    	},

	getName : function()
	{
	    return this.__name;
	},

	addline : function(line)
	{
	    this.__channelText = this.__channelText + line;

	    this.__lines++;

	    // limit lines
	    if (this.__lines > 100)
	    {
		var pos = this.__channelText.search(/<br>/i)
		this.__channelText = this.__channelText.substr(pos + 4);
	    }

	    this.__atom.setLabel(this.__channelText);

// THIS IS SCROLL LOCK TEST CODE
//	    var bottom = this.__scroll.getItemBottom(this.__atom);

//	    alert(this.__scroll.getScrollY());
//	    alert(this.__scroll.getItemBottom(this.__atom) + " < " + this.__scroll.getScrollY());

//	    if (this.__scroll.getItemBottom(this.__atom) < this.__scroll.getScrollY());
	    {
		this.__scroll.scrollToY(100000);
	    }
	},

	changetopic : function(line)
	{
	    var nw = "(" + this.__nw + " channel) ";
	    var cname = this.__name;

	    this.__topic = line;

	    if(line == "")
	    {
		line = "Topic not set.";
	    }

	    if (this.__nw == "Evergreen" && this.__type == 0)
	    {
		cname = cname.substr(1, 1).toUpperCase() + cname.substr(2);
		nw = "Group: ";
	    }
	    else if (this.__nw == "Evergreen" && this.__type == 1)
	    {
		nw = "";
	    }

	    if (this.__type == 0)
	    {
		this.__window.setCaption(nw + cname + " : " + line);
	    }
	    else
	    {
		this.__window.setCaption(nw + "*** Private conversation with " + cname);
	    }
	},

	addnames : function(line)
	{
	    if (this.__type == 0)
	    {
		this.__list.removeAll();

		var names = line.split(" ");
		
		for (var i=0; i < names.length; i++)
		{
		    var display = names[i];

		    if(names[i].charAt(0) == "@")
		    {
			display = "<b>" + display.substr(1) + "</b>"; 
		    }

		    var tmp = new qx.ui.form.ListItem(display).set(
			{ rich : true });
		    tmp.realnick = names[i];

		    this.__list.add(tmp);
		}
	    }
	},

	addname : function(index, nick)
	{
	    if (this.__type == 0)
	    {
		//This command is used only when somebody joins, op check is not needed
		var tmp = new qx.ui.form.ListItem(nick).set(
		    { rich : true });
		tmp.realnick = nick;

		this.__list.addAt(tmp, index);
	    }
	},

	delname : function(nick)
	{
	    if (this.__type == 0)
	    {
		var childs = this.__list.getChildren();
		
		for (var i=0; i < childs.length; i++)
		{
		    var name = childs[i].getLabel();

		    if(name.charAt(0) == "@" || name.charAt(0) == "+")
		    {
			name = name.substr(1);
		    }

		    if(name == nick || name == "<b>" + nick + "</b>") //hackish 2nd part
		    {
			this.__list.remove(childs[i]);
		    }
		}
	    }
	},

	getList : function()
	{
	    var list = new qx.ui.form.List;
	    list.setContextMenu(this.getContextMenu());

	    list.add(new qx.ui.form.ListItem("Wait..."));
	    list.setAllowGrowY(true);
	    this.__list = list;

	    return list;
	},

	getContextMenu : function()
	{
	    var menu = new qx.ui.menu.Menu;

	    var chatButton = new qx.ui.menu.Button("Start private chat with");

	    chatButton.addListener("execute", function(e) {
		// huh!
		var name = this.getLayoutParent().getOpener().getSelection()[0].realnick;
		
		var userwindow = 
		    this.getLayoutParent().getOpener().getLayoutParent().getLayoutParent().userWindowRef;

		userwindow.__srpc.callAsync(userwindow.sendresult,
					    "STARTCHAT", global_id + " " + global_sec + " " + 
					    userwindow.__nw + " " + name);
	    });

	    menu.add(chatButton);

	    if (this.__nw != "Evergreen")
	    {

		var whoisButton = new qx.ui.menu.Button("Whois");

		whoisButton.addListener("execute", function(e) {
		    var name = this.getLayoutParent().getOpener().getSelection()[0].realnick;
		    var userwindow = 
			this.getLayoutParent().getOpener().getLayoutParent().getLayoutParent().userWindowRef;
		    
		    userwindow.__srpc.callAsync(userwindow.sendresult,
						"WHOIS", global_id + " " + global_sec + " " + 
						userwindow.winid + " " + name);
		});

		menu.add(whoisButton);
	    }

	    if (this.__nw == "Evergreen" && this.__usermode == 2)
	    {

		var kickButton = new qx.ui.menu.Button("Kick");

		kickButton.addListener("execute", function(e) {
		    var name = this.getLayoutParent().getOpener().getSelection()[0].realnick;
		    var userwindow = 
			this.getLayoutParent().getOpener().getLayoutParent().getLayoutParent().userWindowRef;
		    
		    userwindow.__srpc.callAsync(userwindow.sendresult,
						"KICK", global_id + " " + global_sec + " " + 
						userwindow.winid + " " + name);
		});

		menu.add(kickButton);

		var banButton = new qx.ui.menu.Button("Kick and ban");

		banButton.addListener("execute", function(e) {
		    var name = this.getLayoutParent().getOpener().getSelection()[0].realnick;
		    var userwindow = 
			this.getLayoutParent().getOpener().getLayoutParent().getLayoutParent().userWindowRef;
		    
		    userwindow.__srpc.callAsync(userwindow.sendresult,
						"BAN", global_id + " " + global_sec + " " + 
						userwindow.winid + " " + name);
		});

		menu.add(banButton);
	    }

	    return menu;
	},

	getSettingsView : function()
	{
	    var composite = new qx.ui.container.Composite(
		new qx.ui.layout.Grid(12,12));

	    //TOPIC

            var ltitle = new qx.ui.basic.Label("Topic:");
	    composite.add(ltitle, {row:0, column: 0})

	    var scomposite1 = new qx.ui.container.Composite(
		new qx.ui.layout.HBox(10));

	    this.topicInput = new qx.ui.form.TextField();
	    this.topicInput.set({ maxLength: 200 });
	    this.topicInput.setWidth(250);
	    scomposite1.add(this.topicInput);

	    var button1 = new qx.ui.form.Button("Change");
	    scomposite1.add(button1);

	    button1.addListener("execute", function (e) {
		this.__srpc.callAsync(
		    this.sendresult,
		    "TOPIC", global_id + " " + global_sec + " " +
			this.winid + " " +
			this.topicInput.getValue());		
	    }, this);
	    
	    composite.add(scomposite1, {row: 0, column: 1});

	    //SOUNDS

            var lsounds = new qx.ui.basic.Label("Sound alerts:");
	    composite.add(lsounds, {row:1, column: 0})

	    var scomposite2 = new qx.ui.container.Composite(
		new qx.ui.layout.HBox(10));
	    
	    var syes = new qx.ui.form.RadioButton("On");
	    var sno = new qx.ui.form.RadioButton("Off");

	    if (this.sound == 0)
	    {
		sno.setValue(true);
	    }
	    else
	    {
		syes.setValue(true);
	    }

	    syes.addListener("click", function(e) {
		this.sound = 1;
		
		this.__srpc.callAsync(
		    this.sendresult,
		    "SOUND", global_id + " " + global_sec +
			" " + this.winid + " " + 1);
	    }, this);

	    sno.addListener("click", function(e) {
		this.sound = 0;
		
		this.__srpc.callAsync(
		    this.sendresult,
		    "SOUND", global_id + " " + global_sec +
			" " + this.winid + " " + 0);
	    }, this);

	    var rmanager = new qx.ui.form.RadioGroup(syes, sno);

	    scomposite2.add(syes);
	    scomposite2.add(sno);

	    composite.add(scomposite2, {row:1, column: 1})

	    //PASSWORD
            var lusermode = new qx.ui.basic.Label("Password:");
	    composite.add(lusermode, {row:2, column: 0})

	    var scomposite3 = new qx.ui.container.Composite(
		new qx.ui.layout.HBox(10));

	    this.pwInput = new qx.ui.form.TextField();
	    this.pwInput.set({ maxLength: 20 });
	    this.pwInput.setWidth(250);
	    this.pwInput.setPlaceholder("<not set>");

	    scomposite3.add(this.pwInput);

	    var button2 = new qx.ui.form.Button("Change");
	    scomposite3.add(button2);

	    button2.addListener("execute", function (e) {
		this.__srpc.callAsync(
		    this.sendresult,
		    "PW", global_id + " " + global_sec + " " +
			this.winid + " " +
			this.pwInput.getValue());		
	    }, this);
	    
	    composite.add(scomposite3, {row: 2, column: 1});

            //var ltitles = new qx.ui.basic.Label("Title alerts:");
	    //composite.add(ltitles, {row:2, column: 0})

	    return composite;
	}
    }
});
