# Node.js API cache

This is the basis for the middleware of the Neureal.net project. With a p2p network hitting an API we need more control over the source so that IPs are not blacklisted etc.  We will also add additional data to the API as per needed by the neureal network.

This middleware timestamps and adds a tick value which is unique and serial for each unique data tick. This allows the p2p network to rely on this tick value for the internal consensus algorithm.

The basic goal here is to add functionality while makes the p2p network more robust by giving developers/sponsors a way to mitigate potential issues. It also offloads a great deal of the complexity into nodejs preventing the release new p2p network code to handle new situations.

------

Caching proxy server for external API calls. Configure the external API endpoint and make requests against localhost. If the request has been made before it'll be served from the local cache. 

If the resouce isn't cached, the request is forwarded to the API

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


