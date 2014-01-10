// Required modules
var express     = require('express');
var http        = require('http');
var https       = require('https');
var fs          = require("fs");
var qs          = require("querystring");
var RateLimiter = require('limiter').RateLimiter;

// API config
var apiOptions = {
  hostname: 'api.github.com',
  port: 443,
  auth: process.env.GITHUB_APPLICATION_KEY, // 'username:pass'
  headers: {'User-agent' : 'node-api-cache'}
};

// Server config
var options = {
  nodePort: 3000,
  rateLimit: true,          // throttle requests, bool
  rateLimitValue: 20,       // quota: req per time unit
  rateLimitPeriod: 'minute' // quote: time for quota refresh: 'second', 'minute', 'hour'
};

// Rate limiter
if (options.rateLimit) {
  var limiter = new RateLimiter(options.rateLimitValue, options.rateLimitPeriod);
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
  var refinedQS    = refineQueryString(req.query);
  var fileName     = (req.path + '_' + refinedQS).replace(/[^a-z0-9]/gi, '_').toLowerCase();
  var filePath     = "./data/" + fileName + '.json';

  // check if the file exists
  fs.exists(filePath, function (exists) {
    if (!exists) {
      console.log('cache MISS : %s %s', req.method, req.url);
      startRequest();
    } else {
      console.log('cache HIT: %s %s', req.method, req.url);
      loadFromFile();
    }
  });

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

    fs.writeFile(filePath, output, function (err) { // Write to disk
      (err) ? console.log('save error') : console.log('saved: ' + filePath);
    });

    respondToClient(output); // Push result to user
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
    // req.setEncoding('utf8');
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

  function stripCallback(ouput) {
    return output.substring(output.indexOf("(") + 1, output.lastIndexOf(")"));
  }
 
});