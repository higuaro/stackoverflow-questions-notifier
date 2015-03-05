const Soup = imports.gi.Soup;

const USER_AGET = 'cinnamon';
const API_ROOT = 'https://api.stackexchange.com/2.2/';
const MINUTE  = 60000;

function StackExchange(options) {
    // By default, turn logging off 
    this._debugEnabled = options.debug || false;
    
    // The stack exchange api object is general, the "site" parameter will
    // dictates which of the stackexchange sites to use 
    this._site = options.site;

    // If given in the options, set the tag list 
    this.setTagList(options.tags);

    this._questions = [];

    try {
        this._httpSession = new Soup.SessionAsync();
        this._httpSession.user_agent = USER_AGET;
    } catch (e) {
        this
        throw 'StackExchange: Failed creating SessionAsync. Details: ' + e;
    }

    try {
        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());
        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ContentDecoder());
    } catch (e) {
        throw 'StackExchange: Failed adding features. Details: ' + e;
    }
}


StackExchange.prototype = {
    constructor: StackExchange,

    setTagList: function(tags) {
        this._tags = tags;
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
    
    _getFromDateParameter: function() {
        // We want all the questions that have been posted since 
        // the current time minus "timeout" minutes
        let time = new Date() - (this._timeout * MINUTE);
        
        // Drop the milliseconds part from the unix time 
        return Math.round(time / 1000);
    },

    loadNewQuestions: function(callback) {
this._log('Loading new questions...');

        let fromDate = this._getFromDateParameter();

        let questionUrl = API_ROOT + 'questions?order=desc&sort=creation&site=stackoverflow&fromdate=' + fromDate;

        let numTags = this._tags.length;

        // Empty the questions array
        this._questions = [];

        this._numLoadedTags = 0;

        // Hold the callback to execute after the reading is done 
        this._callback = callback;

        // For every tag
        for (let i = 0; i < numTags; i++) { 
            // Form the query for the tag
            let url = questionUrl + '&tagged=' + this._tags[i];

this._log('url: ' + url);

            let message = Soup.Message.new('GET', url);

            let that = this;
            this._httpSession.queue_message(message, function(session, message) {
                that._onResponse(session, message);
            });
        }
    },

    _onError: function(msg) {
        global.logError(msg);
    },

    _onResponse: function(session, message) {
        if (message.status_code != 200) {
            // ignore error codes 6 and 7 and 401
            if (message.status_code != 401 && message.status_code != 7 && message.status_code != 6) {
                this._onError('Questions read failed! Status code: ' + message.status_code);
            }

            this._log('Got a response with error code: ' + message.status_code);
            return;
        }
        
        try {
            let questions = this._parseJsonResponse(message);
            
            // "questions" contains a document with one element "items" which is 
            // an array of subdocuments 
this._log('The answer is: ' + questions);
            this._questions.concat(questions.items);

            this._numLoadedTags++;
            
            if (this._numLoadedTags >= this._tags.length) {
                // If the last tag has been harvested, then sort the array 
                // and merge those questions that are the same            

                this._questions = this._prepareQuestions(this._questions);

                // Last, call the callback
                this._callback(this._questions);
            }
        } catch (e) {
            this._onError('Retrieving questions data failed: ' + e);
        }
    },

    _prepareQuestions: function(questions) {
        // Merge those questions that match several tags
        // ( This fancy reduce stuff is O(n^2)  ¬ ¬ )
        questions = questions.reduce(function(prev, cur) {
            // Iterate over "prev" to see if there are repeated questions
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

        return questions.sort(function(question1, question2) { 
            return question1.creation_date < question2.creation_date;
        });
    }
}
