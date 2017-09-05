(function () {
    var srcom_url = $.lang.get('speedruncom.url');
    var misc_category = $.lang.get('speedruncom.misc');
    
    /*
     * CACHE Global variables - used by get_Custom_API_Value_From_Cache()
     * PRIVATE
     */
    var _cache_life = 5 * 60;               // The cache lifespan - 5 minutes
    var _cache = [];                        // The actual cache variable
    var _cache_disabled = false;            // Can be used for debugging

    function getJSONDataFromCache(url) {
        // Disable cache for debug
        if (_cache_disabled) {
            return getJSONData(url);
        }

        // Hash the URL and use it as a key in the cache
        var hash = getHashCode(url);
        if (!(hash in _cache)) {
            // Value not already in the cache
            var new_cache = [];
            new_cache['time'] = new Date().getTime() / 1000;
            new_cache['content'] = getJSONData(url);
            _cache[hash] = new_cache;
            return _cache[hash]['content'];
        }
        else {
            // Value in the cache
            var now = new Date().getTime() / 1000;
            if (now - _cache[hash]['time'] < _cache_life) {
                // Cache didn't expire yet, returning cached value
                return _cache[hash]['content'];
            } else {
                // Cache expired, we recreate
                _cache[hash]['time'] = now;
                _cache[hash]['content'] = getJSONData(url);
                return _cache[hash]['content'];
            }
        }
    }

    function getCustomAPIValue(url) {
        var HttpResponse = Packages.com.gmt2001.HttpResponse,
            HttpRequest = Packages.com.gmt2001.HttpRequest,
            HashMap = Packages.java.util.HashMap,
            responseData = HttpRequest.getData(HttpRequest.RequestType.GET, url, '', new HashMap());

        return responseData.content;
    }

    function getJSONData(URL) {
        var data = getCustomAPIValue(URL);
        return JSON.parse(data);
    }

    function getHashCode(str) {
        var hash = 0;
        if (str.length === 0) return hash;
        for (i = 0; i < str.length; i++) {
            char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }

    function format_primary_times(time) {
        var output = [];

        // Hours
        var hoursReg = /([0-9]{1,2})H/g;
        var hoursMatch = hoursReg.exec(time);
        if (hoursMatch !== null) {
            var hours = hoursMatch[1];
            output.push(hours);
        }

        // Minutes
        var minReg = /([0-9]{1,2})M/g;
        var minMatch = minReg.exec(time);
        if (minMatch !== null) {
            var minutes = minMatch[1];
            if (hoursMatch && minutes.length == 1) {
                minutes = "0" + minutes;
            }
            output.push(minutes);
        }
        else if (!minMatch && hoursMatch) {
            output.push("00");
        }

        // Seconds
        var restReg = /([0-9]{1,2}(?:\.[0-9]{1,3})?)S/g;
        var restMatch = restReg.exec(time);
        if (restMatch !== null) {
            var rest = restMatch[1];
            var seconds = rest.split(".")[0];
            if (restMatch && seconds.length == 1) {
                rest = "0" + rest;
            }
            output.push(rest);
        }
        else if (!restMatch && minMatch) {
            output.push("00");
        }

        return output.join(":");
    }

    function encodeQueryData(data) {
        var ret = [];
        for (var d in data)
            ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
        return ret.join('&');
    }

    function buildUrl(url) {
        //return 'getJSON.php?url=' + srcom_url + encodeURIComponent(url);
        return srcom_url + url;
    }

    function findGameAndCategories(game_name) {
        var url = buildUrl(
            '/games?' + encodeQueryData(
            {
                'name': game_name,
                'embed': 'categories'
            }
            )
        );

        var games = getJSONDataFromCache(url);
        if (games.pagination.size > 0) {
            for (var g in games.data) {
                if (games.data.hasOwnProperty(g)) {
                    var game = games.data[g];
                    if (game.names.twitch === game_name) {
                        return game;
                    }
                }
            }
        }

        // Game not found
        return false;
    }

    function findPlayer(player_name) {
        var url = buildUrl(
            '/users?' + encodeQueryData(
            {
                'lookup': player_name,
            }
            )
        );

        var users = getJSONDataFromCache(url);
        if (users.data.length === 1) {
            return users.data[0];
        } else {
            return false;
        }
    }

    function getWorldRecordPerCategory(game_id, category_id) {
        var url = buildUrl(
            '/leaderboards/' + game_id + '/category/' + category_id + '?' + encodeQueryData(
            {
                'embed': 'players',
                'top': '1'
            }
            )
        );
        var leaderboards = getJSONDataFromCache(url);
        if (leaderboards.data.runs.length > 0) {
            return leaderboards.data;
        } else {
            return false;
        }
    }

    function getWorldRecordPerGame(game_name) {
        var game = findGameAndCategories(game_name);

        if (game) {
            var records = [];
            for (var c in game.categories.data) {
                if (game.categories.data.hasOwnProperty(c)) {
                    var category = game.categories.data[c];

                    if (category.miscellaneous === false || misc_category === true) {
                        var leaderboards = getWorldRecordPerCategory(game.id, category.id);

                        if (leaderboards) {
                            var time = '';
                            var players = [];

                            // Time
                            var run = leaderboards.runs[0].run;
                            time = format_primary_times(run.times.primary);

                            // Players
                            for (var p in leaderboards.players.data) {
                                if (leaderboards.players.data.hasOwnProperty(p)) {
                                    var player = leaderboards.players.data[p];

                                    switch (player.rel) {
                                        case 'guest':
                                            players.push(player.name);
                                            break;
                                        default:
                                            players.push(player.names.international);
                                    }
                                }
                            }

                            records.push(category.name + ' ' + time + ' by ' + players.join(' & '));
                        }
                    }
                }
            }

            if (records.length > 0) {
                return records.join(' | ');
            } else {
                return 'No records found.';
            }

        } else {
            return 'Game not found.';
        }
    }

    function getPersonalBests(game_name, player_name) {
        var player = findPlayer(player_name);

        if (player) {
            var game = findGameAndCategories(game_name);

            if (game) {
                var url = buildUrl(
                    '/users/' + player.id + '/personal-bests?' + encodeQueryData(
                    {
                        'embed': 'category',
                        'game': game.id
                    }
                    )
                );

                var personalBests = getJSONDataFromCache(url);
                if (personalBests) {

                    if (personalBests.data.length > 0) {
                        var PBS = [];
                        for (var p in personalBests.data) {
                            if (personalBests.data.hasOwnProperty(p)) {
                                var pb = personalBests.data[p];
                                PBS.push(pb.category.data.name + ' ' + format_primary_times(pb.run.times.primary));
                            }
                        }

                        return PBS.join(' | ');

                    } else {
                        return 'No personal best found.';
                    }
                } else {
                    return 'No personal best found.';
                }
            } else {
                return 'Game not found.';
            }
        } else {
            return 'Player not found.';
        }

    }

    $.bind('command', function (event) {
        var command = event.getCommand();

        var game_twitch_name = $.lang.get('speedruncom.game');
        if (game_twitch_name === '') {
            game_twitch_name = $.getGame($.channelName);
        }

        var player_name = $.lang.get('speedruncom.account');
        if (player_name === '') {
            player_name = $.channelName;
        }

        if (command.equalsIgnoreCase('pb')) {
            $.say(getPersonalBests(game_twitch_name, player_name));
        }
        else if (command.equalsIgnoreCase('wr')) {
            $.say(getWorldRecordPerGame(game_twitch_name));
        }
    });

    $.bind('initReady', function () {
        $.registerChatCommand('./commands/speedruncomCommand.js', 'pb', 7);
        $.registerChatCommand('./commands/speedruncomCommand.js', 'wr', 7);
    });
})();

