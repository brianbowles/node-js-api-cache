# Node.js API cache

This is the basis for the middleware of the Neureal.net project. With a p2p network hitting an API we need more control over the source so that IPs are not blacklisted etc.  We will also add additional data to the API as per needed by the neureal network.


------

Caching proxy server for external API calls. Configure the external API endpoint and make requests against localhost. If the request has been made before it'll be served from the local cache. 

E.g:

    # Make requests against:
    http://localhost:3000/search/repositories?q=jquery&callback=myCallback

    # If the resouce isn't cached, the request is forwarded to the API:
    https://api.github.com/search/repositories?q=jquery&callback=myCallback


Useful for development (faster response / offline work) and remaining within any rate limits imposed by the API.

## Features

- Memory or file system caching (stored in: ```./data```)
- Rate limiter (throttle requests to external API)

## Usage

Fork & adjust the ```apiOptions``` & ```options```:

    // API config
    var apiOptions = {
      hostname: 'api.github.com',
      port: 443,
      auth: process.env.GITHUB_APPLICATION_KEY, // 'username:pass'
      headers: {'User-agent' : 'node-api-cache'}
    };

    // Server config
    var options = {
      memCache: true,           // true = memory, false = use filesystem
      memCacheTime: 0,          // Seconds, 0 = unlimited
      nodePort: 3000,           // port to start server on
      rateLimit: true,          // throttle requests, bool
      rateLimitValue: 20,       // quota: req per time unit
      rateLimitPeriod: 'minute' // quote: time for quota refresh: 'second', 'minute', 'hour'
    };


## Warning

This is v0.01 / only for hacking about. Only works for GET requests, where a JSONP response is expected from the API. Only tested against the GitHub search API so far.
