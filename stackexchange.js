const Soup = imports.gi.Soup;

const API_ROOT = 'https://api.stackexchange.com/2.2/';
                  
function StackExchange(options) {
    this._debugEnabled = options.debug || false;
    this._site = options.site;
    this._userAgent = 'cinnamon';

this._log('setting tag list: ' + options.tags);

    this.setTagList(options.tags);

    this._questions = [];

    this._lastCheck = new Date();

    try {
        this._httpSession = new Soup.SessionAsync();
        this._httpSession.accept_language = 'en';
        this._httpSession.user_agent = this._userAgent;
    } catch (e) {
        throw 'StackExchange: Failed creating SessionAsync\nDetails: ' + e;
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

    _log: function() {
        if (this._debugEnabled) { 
            global.log.apply(global, arguments);
        }
    },

    _parseJsonResponse: function(response) {
        var rawJSON = response.response_body.data;
        return JSON.parse(rawJSON);
    },


    setTagList: function(tags) {
this._log('setting tags = ' + tags);
        this._tags = tags;
    },
    
    setTimeout: function(timeout) { 
        this._timeout = timeout;
    }

    loadNewQuestions: function(callback) {
this._log('Loading new questions...');
this._log('this._lastCheck.getTime()...' + this._lastCheck.getTime());

        let time = this._lastCheck.getTime() 
        let fromDate = Math.round(( ) / 1000);
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

    _onResponse: function(session, message) {
this._log('Got a response!');
this._log('Response status_code: ' + message.status_code);
        if (message.status_code != 200) {
            // ignore error codes 6 and 7 and 401
            if (message.status_code != 401 && message.status_code != 7 && message.status_code != 6) {
                global.logError('')
                this.on_error('Questions read failed', 'Status code: ' + message.status_code);
            }

            this._log('_onResponse error code: ' + message.status_code);
            return;
        }
        try {
this._log('message: ' + message);
/*
for (let p in message) {
    this._log('property ' + p + ' = ' + message[p]);
}
*/

if (message.response_body.data) {
    this._log('data exists!');
} else {
    this._log('data does not exists!');
}
this._log('This never shows');

this._log('message.response_body.data: ' + message.response_body.data);
            let questions = this._parseJsonResponse(message);
            // questions contains a document with one element "items" which is 
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
            global.log('Retrieving questions data failed: ' + e);
            for (let p in e) {
                global.log(p + ': ' + e[p]);
            }
            global.logError('Retrieving questions data failed:', e);
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
