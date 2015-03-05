
// Allows importing other files using the following:
//   const StackExchange = imports.stackexchange; // imports file "stackexchange.js"
// imports.searchPath.push( imports.ui.appletManager.appletMeta["stackoverflow-questions-notifier@higuaro"].path );

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

// const StackExchange = imports.stackexchange;
let StackExchange;

const APPLET_ICON = global.userdatadir + '/applets/stackoverflow-questions-notifier@higuaro/icon.png';
const TAG_SEPARATOR = ',';
const MINUTE  = 60000;

/* Main */
function main(metadata, orientation, instance_id) {
    let myModule = imports.ui.appletManager.applets[metadata.uuid];

    StackExchange = myModule.stackexchange;

//    global.log('StackOverflow object = ', StackOverflow);
    let myApplet = new MyApplet(metadata, orientation, instance_id)

    return myApplet;
}

/* Constructor */
function MyApplet(metadata, orientation, instance_id) {
    this._debugEnabled = true;
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
            this.set_applet_icon_path(APPLET_ICON);
            
            let that = this;
            this.on_applet_removed_from_panel(function() {
                that._stopTimer();
            });

            this.set_applet_tooltip(_('Click here to disable question watching'));

            this._startTimer();
        } catch (e) {
            global.logError(e);
        }
    },


    _bindSettings: function(metadata, instance_id) {
        // Create the settings object 
        this._settings = new Settings.AppletSettings(this, metadata.uuid, instance_id);
        
        // Full description of the BindingDirection can be found at:
        // https://github.com/linuxmint/Cinnamon/wiki/Applet,-Desklet-and-Extension-Settings-Reference    
    
        this._settings.bindProperty(Settings.BindingDirection.IN,   // The binding direction - IN means we only listen for changes from this applet
                         'txtTagList',                              // The key of the UI control associated with the setting in the "settings-schema.json" file
                         'txtTagList',                              // string of the applet property
                         this._onSettingsChanged,
                         null);
    
        this._settings.bindProperty(Settings.BindingDirection.IN,
                         'scaQueryFrecuency',
                         'scaQueryFrecuency',
                         this._onSettingsChanged,
                         null);
    },

    _createStackOverflowApiObject: function() {
        var options = {};
        options.site = 'stackoverflow';
        options.debug = true;

        return new StackExchange.StackExchange(options);
    },

    _log: function() {
        if (this._debugEnabled) { 
            global.log.apply(global, arguments);
        }
    },
    
    _startTimer: function() {
        this._log('Starting timer...');
        
        let that = this;
        this._timerId = Mainloop.timeout_add(this._timeout * MINUTE, function() {
            that._onTimer();
            that._startTimer();
        });         
    },
    
    _stopTimer: function() {
        if (this._timerId) {
            // stop the current running timer
            this._log('Stopping timer...');
            Mainloop.source_remove(this._timerId);
            this._timerId = 0;
        }        
    },
    
    _onTimer: function() {
        this._log('A timer event got fired');
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
            let title = question.title;
            if (question.is_answered) {
                title = '\u2714 ' + title;
            }
            let body = question.link + '\n\n'; 
            body += 'Asked by: ' + question.owner.display_name + ' [rep: '
                     + question.owner.reputation + ']\n';
            body += 'Question votes: ' + question.score + '\n\n';
            body += 'Tags: ';
            for (let i = 0; i < question.tags.length; i++) { 
                body += question.tags[i];
                if (i < question.tags.length - 1) {
                    body += ', ';
                }
            }
            
            let command = 'notify-send -t 5 --icon="' + APPLET_ICON + '" "' + title + '" "' + body + '"';
            that._log('Command', command);
            Util.spawnCommandLine(command);
        });
    },

    _onSettingsChanged: function() {
        global.log('Settings have changed!');
        this._readSettingsValues();
        this._stopTimer();
        this._startTimer();
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

        let timeout = parseInt(this._settings.getValue('scaQueryFrecuency'), 10)
        this._stackoverflow.setTimeout(timeout);
        this._log('The new timeout is:' + timeout);
    }
};
