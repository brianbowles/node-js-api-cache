// Required modules
var express = require('express');
var http    = require('http');
var https   = require('https');
var qs      = require('querystring');
var crypto  = require('crypto');
var _       = require('underscore');

// API config
var apiOptions = {
  hostname: 'api.github.com',
  port: 443,
  auth: process.env.GITHUB_APPLICATION_KEY, // 'username:pass'
  headers: {'User-agent' : 'node-api-cache'}
};

// Server config
var options = {
  memCache: true,          // true = memory, false = use filesystem
  nodePort: 3000,           // port to start server on
  rateLimit: true,          // throttle requests, bool
  rateLimitValue: 20,       // quota: req per time unit
  rateLimitPeriod: 'minute' // quote: time for quota refresh: 'second', 'minute', 'hour'
};

// Rate limiter - optional
if (options.rateLimit) {
  var RateLimiter = require('limiter').RateLimiter;
  var limiter     = new RateLimiter(options.rateLimitValue, options.rateLimitPeriod);
}

// NodeCache memory cache - optional
if (options.memCache) {
  var NodeCache = require('node-cache');
  var cache     = new NodeCache();
} else {
  var fs = require("fs");
}

// Start server
var app = express();
app.enable("jsonp callback");

app.listen(options.nodePort);
console.log("Starting API cache for %s. Listening on port 3000.", apiOptions.hostname);

app.use(function(req, res, next){

  // ignore favicon requests from browser
  if (req.url === '/favicon.ico') { 
    res.send('OK');
    return;
  }
  
  var callbackName = req.param('callback');
  var key          = generateKey();
  var filePath     = "./data/" + key + '.json';
  
  if (options.memCache) {
    tryCache();
  } else {
    tryFileSystem();
  }

  function generateKey() {
    var md5sum = crypto.createHash('md5');
    md5sum.update(req.path + '?' + refineQueryString(req.query));
    return md5sum.digest('hex');
  }

  function tryCache() {
    cache.get(key, function(err, value){
      if(_.isEmpty(value)){
        console.log('cache MISS: %s %s', req.method, req.url);
        startRequest();
      } else {
        console.log('cache HIT: %s %s', req.method, req.url);
        respondToClient(value[key]);
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
    apiOptions.path = req.originalUrl;

    if (options.rateLimit) {
      limiter.removeTokens(1, function(err, remainingReq) {
        console.log("API requests left this %s: %s", options.rateLimitPeriod,remainingReq);
        makeApiRequest();
      });
    } else {
      makeApiRequest();
    }
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

  function apiResponseEnd(output) {
    output = stripCallback(output); // remove JSONP callback from cached version

    (options.memCache) ? saveToCache(output) : saveToFile(ouput);
    
    respondToClient(output); // Push result to user
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

  function respondToClient(data) {
    res.set({"Content-Type": "application/json"});
    res.write(callbackName + '(' + data + ')');
    res.end();
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