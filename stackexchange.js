const Lang = imports.lang;

const Soup = imports.gi.Soup;

const USER_AGET = 'cinnamon';
const MINUTE  = 60000;

function StackExchange(options) {
    // By default, turn logging off 
    this._debugEnabled = options.debug || false;
    
    // The stack exchange api object is general, the "site" parameter will
    // dictates which of the stackexchange sites to use 
    this._site = options.site;

    // this._key = options.key;
    this._key = undefined;

    // If given in the options, set the tag list 
    this.setTagList(options.tags);

    this._questions = [];

    try {
        this._httpSession = new Soup.SessionAsync();
        this._httpSession.user_agent = USER_AGET;
    } catch (e) {
        this.onError(e);
        throw 'StackExchange: Failed creating SessionAsync. Details: ' + e;
    }

    try {
        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());
        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ContentDecoder());
    } catch (e) {
        this.onError(e);    
        throw 'StackExchange: Failed adding features. Details: ' + e;
    }
}

//////////////////////////////////
// Static "alike" declarations
//////////////////////////////////

StackExchange.API_ROOT = 'https://api.stackexchange.com/2.2/';
StackExchange.MAX_NUMBER_OF_TAGS_ALLOWED = 10;

// "static method" to generate a notification command from a given question 
StackExchange.getQuestionPopupCommand = function(iconPath, question) {
    let title = question.title;
    
    // filter title 
    title = title.replace(/&#39;/g, '\'');
    title = title.replace(/&quot;/g, '"');
    
    if (question.is_answered) {
        title = '\u2714 ' + title;
    }
    let body = question.link + '\n'; 
    body += 'Question votes: <b>' + question.score + '</b>\n';
    body += 'Tags: ';
    for (let i = 0; i < question.tags.length; i++) { 
        body += '<b>' + question.tags[i] + '</b>';
        if (i < question.tags.length - 1) {
            body += ', ';
        }
    }
    body += '\nAsked by: <b>' + question.owner.display_name + '</b> [rep: '
             + question.owner.reputation + ']\n';

    return 'notify-send -t 5 --icon="' + iconPath + '" "' + title + '" "' + body + '"';
}

//////////////////////////////////

StackExchange.prototype = {
    constructor: StackExchange,

    setTagList: function(tags) {
        this._tags = tags || [];
    },
    
    setTimeout: function(timeout) { 
        this._timeout = timeout;
    },

    _log: function() {
        if (this._debugEnabled) { 
            for (let i = 0; i < arguments.length; i++) {
                global.log(arguments[i]);
            }
        }
    },

    _parseJsonResponse: function(message) {
        var rawJSON = message.response_body.data;
        return JSON.parse(rawJSON);
    },
    
    _getDateParameter: function() {
        // We want all the questions that have been posted since 
        // the current time minus "timeout" minutes
        let time = new Date() - (this._timeout * MINUTE);
        
        // Drop the milliseconds part from the unix time 
        return Math.round(time / 1000);
    },

    _createBaseUrl: function() {
        let fromDate = this._getDateParameter();
        let baseUrl = StackExchange.API_ROOT + 
                      'questions?order=desc&sort=creation&site=' + this._site + 
                      '&fromdate=' + fromDate;
        
        if (this._key) {
            baseUrl += '&key=' + this._key;
        }
    
        return baseUrl;
    },
    
    loadNewQuestions: function(onSuccessCallback, onGeneralErrorCallback, onThrottleErrorCallback) {
        this._log('Checking for new questions...');

        let questionUrl = this._createBaseUrl();

        let numTags = this._tags.length;

        // Clamp the number of tags        
        if (numTags > StackExchange.MAX_NUMBER_OF_TAGS_ALLOWED) {
            numTags = StackExchange.MAX_NUMBER_OF_TAGS_ALLOWED;
        }

        // Clear the questions array
        this._questions = [];

        // Reset the number of loaded tags
        this._numLoadedTags = 0;



        // Hold a reference to the callbacks
        this._successCallback = onSuccessCallback;
        this._errorCallback = onGeneralErrorCallback;
        this._throttleErrorCallback = onThrottleErrorCallback;

        let responseCallback = Lang.bind(this, function(session, message) {
            this.onResponse(session, message);
        });

        for (let i = 0; i < numTags; i++) { 
            // Add the tags to the query
            let url = questionUrl + '&tagged=' + this._tags[i];
            this._log('url: ' + url);

            let message = Soup.Message.new('GET', url);
            // Add the following property on the fly to the object, 
            // in case an error occurs, use this to show an error message 
            message.url = url;

            this._httpSession.queue_message(message, responseCallback);
        }
    },

    onError: function(msg) {
        global.logError(msg);
    },

    _handleError: function(message) {
        this._log('Got a response with error code: ' + message.status_code);
        
        if (message.status_code == 400) {
            let error = this._parseJsonResponse(message);
            if (error && error.error_id === 502) {
                // Extract retry time from message
                var res = /more requests available in (\d+) seconds$/.exec(error.error_message);
                if (res && res.length === 2) {
                    let cooldownTime = parseInt(res[1]) * 1000;
                    this._log('You have to wait ' + cooldownTime + ' milliseconds to use the API calls again');
                    if (this._throttleErrorCallback) {
                        this._throttleErrorCallback(cooldownTime);
                        return;
                    }
                } 
            }           
        } 

        if (this._errorCallback) {
            this._errorCallback('Questions read failed! An HTTP error ' + 
                                 message.status_code + ' ocurred trying to ' +
                                 'reach:\n' + message.url);
        }
    },
    

    onResponse: function(session, message) {
        if (message.status_code != 200) {
            this._handleError(message);
            return;
        }
        
        try {
            let questions = this._parseJsonResponse(message);
            
            // "questions" contains a document with one element "items" which is 
            // an array of subdocuments 
            for (let i = 0; i < questions.items.length; i++) {
                this._questions.push(questions.items[i]);
            }

            this._numLoadedTags++;
            
            if (this._numLoadedTags >= this._tags.length) {
            
                // If the last tag has been queried successfully, then merge and 
                // sort the array with the gathered questions
                let questions = this._mergeAndSortQuestions(this._questions);

                // Last, call the callback
                this._successCallback(questions);
            }
        } catch (e) {
            this.onError('Retrieving questions data failed: ' + e);
            this._errorCallback(e);
        }
    },

    _mergeAndSortQuestions: function(questions) {
        // Merge those questions that match several tags
        // ( This fancy reduce stuff is O(n^2) )
        questions = questions.reduce(function(prev, cur) {
            // Iterate over "prev" to see if there are duplicated questions
            let size = prev.length;
            let founded = false;
            for (let i = 0; i < size; i++) {
                if (prev[i].question_id === cur.question_id) {
                    founded = true;
                    break;
                }
            }
            if (!founded) {
                prev.push(cur);
            }
            return prev;
        }, []);

        // Sort them by creation_date, older first, newer last
        return questions.sort(function(question1, question2) { 
            return question1.creation_date > question2.creation_date;
        });
    }
}
