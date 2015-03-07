
// Allows importing other files using the following:
//   const StackExchange = imports.stackexchange; // imports file "stackexchange.js"
 imports.searchPath.push( imports.ui.appletManager.appletMeta["stackoverflow-questions-notifier@higuaro"].path );

// gettext support (although I don't use it here)
const Mainloop = imports.mainloop;
const Lang = imports.lang;

const Gettext = imports.gettext.domain('cinnamon-applets');
const _ = Gettext.gettext;

const Applet = imports.ui.applet;
const Util = imports.misc.util;
const GLib = imports.gi.GLib;

const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;

const Tooltips = imports.ui.tooltips;
const Settings = imports.ui.settings;

const StackExchange = imports.stackexchange;

const APPLET_ICON = global.userdatadir + '/applets/stackoverflow-questions-notifier@higuaro/icon.png';
const DISABLED_APPLET_ICON = global.userdatadir + '/applets/stackoverflow-questions-notifier@higuaro/icon_disabled.png';
const TAG_SEPARATOR = ',';
const MINUTE  = 60000;

/* Main */
function main(metadata, orientation, instance_id) {
    return new MyApplet(metadata, orientation, instance_id);
}

/* Constructor */
function MyApplet(metadata, orientation, instance_id) {
    this._debugEnabled = false;
    this._watchingEnabled = true;
    this._init(metadata, orientation, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(metadata, orientation, instance_id) {
        Applet.IconApplet.prototype._init.call(this, orientation, instance_id);

        this._stackoverflow = this._createStackOverflowApiObject();

        this._bindSettings(metadata, instance_id);
        this._readSettingsValues();
        
        try {
            this.enableApplet();
            this.startTimer();
        } catch (e) {
            global.logError(e);
        }
    },

    on_applet_removed_from_panel: function(event) {
        this._log('Removing the applet from the panel');
        this.stopTimer();
    },

    disableApplet: function() {
        this.set_applet_icon_path(DISABLED_APPLET_ICON);
        this.set_applet_tooltip(_('Click here to turn off question notifications'));
    },

    enableApplet: function() {
        this.set_applet_icon_path(APPLET_ICON);
        this.set_applet_tooltip(_('Click here to turn on question notifications'));
    },

    on_applet_clicked: function(event) {
        this._watchingEnabled = !this._watchingEnabled;

        this.stopTimer();
        if (this._watchingEnabled) {
            this._log('Questions checking disabled');
            this.enableApplet();
            this.startTimer();
        } else {
            this._log('Questions checking enabled');
            this.disableApplet();
        }
    },

    _bindSettings: function(metadata, instance_id) {
        // Create the settings object 
        this._settings = new Settings.AppletSettings(this, metadata.uuid, instance_id);
        
        // Full description of the BindingDirection can be found at:
        // https://github.com/linuxmint/Cinnamon/wiki/Applet,-Desklet-and-Extension-Settings-Reference    
    
        this._settings.bindProperty(Settings.BindingDirection.IN,   // The binding direction - IN means we only listen for changes from this applet
                         'txtTagList',                              // The key of the UI control associated with the setting in the "settings-schema.json" file
                         'txtTagList',                              // name that is going to be used as the applet property
                         this.onSettingsChanged,
                         null);
    
        this._settings.bindProperty(Settings.BindingDirection.IN,
                         'scaQueryFrecuency',
                         'scaQueryFrecuency',
                         this.onSettingsChanged,
                         null);                                                                        
    },

    _createStackOverflowApiObject: function() {
        var options = {};
        options.site = 'stackoverflow';
        options.debug = this._debugEnabled;

        return new StackExchange.StackExchange(options);
    },

    _log: function(msg) {
        if (this._debugEnabled) { 
            global.log(msg);
        }
    },

    startTimer: function() {
        this._log('Starting timer...');

        let that = this;
        let timeout = this._getTimeoutSetting();
        this._timerId = Mainloop.timeout_add(timeout * MINUTE, function() {
            that.onTimer();
        });
    },
    
    stopTimer: function() {
        if (this._timerId) {
            // stop the current running timer
            this._log('Stopping timer...');
            Mainloop.source_remove(this._timerId);
            this._timerId = 0;
        }        
    },
    
    onTimer: function() {
        this.checkNewQuestions();
    },
    
    checkNewQuestions: function() {
        var that = this;
        this._stackoverflow.loadNewQuestions(function(questions) {
            that.showNewQuestions(questions);
        });        
    },
    
    showNewQuestions: function(questions) {
        var that = this;
        questions.forEach(function(question) {
            // Show a notification box for every new question
            let command = StackExchange.StackExchange.getQuestionPopupCommand(APPLET_ICON, question);
            that._log('Command: ' + command);
            Util.spawnCommandLine(command);
        });
        this.stopTimer();
        this.startTimer();
    },

    onSettingsChanged: function() {
        global.log('Settings have changed!');
        this.stopTimer();
        this._readSettingsValues();
        this.startTimer();
    },

    _getTimeoutSetting: function() {
        return parseInt(this._settings.getValue('scaQueryFrecuency'), 10) || 5;
    },

    _readSettingsValues: function() {
        this._log('Reading settings...');
        let txtTagList = this._settings.getValue('txtTagList');

        let tags = txtTagList.split(TAG_SEPARATOR).map(function(tag) { 
             return tag.trim();
        });

        // Remove duplicated tags
        tags = tags.reduce(function(prev, current) {
            let exists = false;
            let size = prev.length;
            for (let i = 0; i < size; i++) {
                if (prev[i] === current) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                prev.push(current);   
            }
            return prev;
        }, []);

        this._log('The new tag list is: ' + tags);
        this._stackoverflow.setTagList(tags);

        let timeout = this._getTimeoutSetting();
        this._stackoverflow.setTimeout(timeout);
        this._log('The new timeout is:' + timeout);
    },

    onOpenStackoverflowPressed: function(event)  {
        this._openUrlInBrowser('http://stackoverflow.com/');
    },

    onOpenCinnamonHomePressed: function(event) { 
        this._openUrlInBrowser('http://cinnamon-spices.linuxmint.com/applets/');    
    },

    onOpenDevPagePressed: function(event) {
        this._openUrlInBrowser('http://geekofficedog.blogspot.com/');
    },

    _openUrlInBrowser: function(url) {
        Util.spawnCommandLine("xdg-open " + url);
    }
};
