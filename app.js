// Required modules
//var fifo = require('fifo')(); the node-cache cleans out according to seconds, which is sufficient for now.. fifo not needed?
var express = require('express');
var http    = require('http');
var https   = require('https');
var qs      = require('querystring');
var crypto  = require('crypto');
var _       = require('underscore');
var moment  = require('moment');


//var fifoCnt = 0;
// API config
var apiOptions = {
  hostname: 'www.bitstamp.net',
  port: 443,
  path: '/api/ticker/',
  dataName: 'last',
//  auth: process.env.GITHUB_APPLICATION_KEY, // 'username:pass'
  headers: {'User-agent' : 'neureal-net-proxy'}
};

// Server config
var options = {
  memCache: true,           // true = memory, false = use filesystem
  memCacheTime: 600,         // Seconds, 0 = unlimited
  nodePort: 3001,           // port to start server on
  rateLimit: true,          // throttle requests, bool
  rateLimitValue: 20,       // quota: req per time unit
  rateLimitPeriod: 'minute' // quote: time for quota refresh: 'minute', 'hour' , 'day' .. second not supported

};

// Rate limiter - optional
if (options.rateLimit) {
  var RateLimiter = require('limiter').RateLimiter;
  var limiter     = new RateLimiter(options.rateLimitValue, options.rateLimitPeriod);

  var perSecond = 0;
  var secondsPerLimiter = 0;
  if (options.rateLimitPeriod == 'minute') {
      secondsPer = 60;
  }  else if (options.rateLimitPeriod == 'hour') {
      secondsPer = 3600;
  }  else if (options.rateLimitPeriod == 'day') {
      secondsPer = 3600 * 24;
  } else {
      console.log("Invalid rateLimitPeriod");
      exit(1);
  }
  secondsPerLimiter = secondsPer / options.rateLimitValue;
}

// NodeCache memory cache - optional
if (options.memCache) {
  var NodeCache = require('node-cache');
  var cache     = new NodeCache({stdTTL: options.memCacheTime, checkperiod: options.memCacheTime});
} else {
  var fs = require("fs");
  if (!fs.existsSync('./data/')) {
    console.log('Data directory doesnt exist. Creating...');
    fs.mkdirSync('./data/');
  }
}

// Start server
var app = express();
app.enable("jsonp callback");

app.listen(options.nodePort);
console.log("Starting API cache for %s. Listening on port " + options.nodePort, apiOptions.hostname);

app.use(function(req, res, next){

    if (req.url === '/favicon.ico') { 
	res.send('OK');
	return;
    }
    var filePath,key;
    console.log("url=" + req.url.substr(0,9) + " - [" + req.url +"]");
    if (req.url.substr(0,9) === '/history/') { 
	key = req.url.substr(9,req.url.length - 9);
	filePath = "./data/" + key + '.json';
	console.log("Trying history with [%s]",key);
	(options.memCache) ? tryHistoryCache() : tryHistoryFileSystem();
	return;
    }

    //console.log(req);  
    var callbackName = req.param('callback');

    // So we need a key that is changed once per time window during the limiter
    // strip out millisecs .. then put them back in as needed

    var currentDate = moment(Math.round((new Date()) / 1000)*1000);  // remove sub-second resolution

    // See http://momentjs.com/docs/#/displaying/ this allows complete customization of output string
    // have the key not change until a new time period
    // the modulo enforces a unique key per time frame of tick
    var keyDate = moment(currentDate - (((currentDate / 1000) % secondsPerLimiter))*1000);

    var tick = Math.round(keyDate / (secondsPerLimiter * 1000));
    key = tick; // Lets just use the tick as the key to make things simpler

    //console.log("secondsPerLimiter" + " = " + secondsPerLimiter + " --- " + (currentDate % secondsPerLimiter));
    //console.log(moment(currentDate).format() + " --- " + key);

    filePath     = "./data/" + key + '.json';
  
    // Check cache
    (options.memCache) ? tryCache() : tryFileSystem();

  function tryCache() {
    cache.get(key, function(err, value) {
      if(_.isEmpty(value)){
        console.log('cache MISS');
        startRequest();
      } else {
        console.log('cache HIT');
        respondToClient(value[key]);
      }
    });
  }
  function tryHistoryCache() {
    cache.get(key, function(err, value) {
      if(_.isEmpty(value)){
        console.log('history MISS');
	return; // TODO define a missed history request
      } else {
        console.log('history HIT');
        respondToClient(value[key]);
      }
    });
  }

  function tryHistoryFileSystem() {
    fs.exists(filePath, function (exists) {
      if (!exists) {
        console.log('history file cache MISS: %s %s', req.method, req.url);
	return;
      } else {
        console.log('history file cache HIT: %s %s', req.method, req.url);
        loadFromFile();
      }
    });

  }

  function tryFileSystem() {
    fs.exists(filePath, function (exists) {
      if (!exists) {
        console.log('file cache MISS: %s %s', req.method, req.url);
        startRequest();
      } else {
        console.log('file cache HIT: %s %s', req.method, req.url);
        loadFromFile();
      }
    });
  }

  function startRequest() {

    limiter.removeTokens(1, function(err, remainingReq) {
      console.log("API requests left this %s: %s", options.rateLimitPeriod,remainingReq);
      makeApiRequest();
    });

  }

  function makeApiRequest() {
    var apiReq = https.get(apiOptions, function(apiRes) {
        var output = '';
        apiRes.on('data', function (chunk) {output += chunk});
        apiRes.on('end', function() {apiResponseEnd(output)});
    });

    apiReq.end();

    apiReq.on('error', function(e) {
      console.error(e);
      res.status(400).send('Sorry. There was an error calling the API.')
      return;
    });
  }
  // add data to the original oracles output
  // tick & time
  function addNeurealJSON(output) {
      var obj = JSON.parse(output);
      var retObj = {};

      retObj['data'] = obj[apiOptions.dataName];
      retObj['tick'] = tick;
      retObj['date'] = keyDate;

      return JSON.stringify(retObj);
  }

  function apiResponseEnd(output) {

    console.log("output before = " + output);
      //output = stripCallback(output); // remove JSONP callback from cached version
     
    output = addNeurealJSON(output);
    console.log("output after = " + output);

    (options.memCache) ? saveToCache(output) : saveToFile(output);
    
    respondToClient(output);
  }

  function saveToCache(output) {
    cache.set(key, output, function(err, success){
      (!err && success) ? console.log('Saved to cache') : console.log('Cache save error');
    });
  }

  function saveToFile(output) {
    fs.writeFile(filePath, output, function (err) { // Write to disk
      (err) ? console.log('Save error') : console.log('Saved: ' + filePath);
    });
  }

  function loadFromFile() {
    fs.readFile(filePath, function(err, data) {
      if (err) {
        console.log('Error reading file');
        res.status(400).send('Sorry. There was an error reading the file.')
        return;
      } else {
        respondToClient(data);
      }
    });
  }
/*
  function pruneMemCache(lastKey) {

      fifoCnt++;
      fifo.push(lastKey);
      if (fifoCnt > 100) {
	  fifo.shift();

      }
  }
*/
  function respondToClient(data) {
    res.set({"Content-Type": "application/json"});

    //res.write(callbackName + '(' + data + ')'); // JSON -> JSONP
    res.write(data);
    res.end();
    //pruneMemCache();
  }

  function refineQueryString(reqQuery) {
    // strip the jQuery cachebuster and callback to make the filename
    delete reqQuery['_'];
    delete reqQuery['callback'];
    return qs.stringify(reqQuery);
  }

  function stripCallback(output) {
    return output.substring(output.indexOf("(") + 1, output.lastIndexOf(")"));
  }
 
});
