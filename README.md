# Docker Control

A simple REST-ish API that allows a Carina control panel user to interact with their clusters.

Behind the scenes, it uses the Carina control panel session ID to download the credentials bundle for the requested cluster and then proxy the request to the matching Docker remote API endpoint.

### Installation

```bash
$ docker build -t docker-control .
```

### Running

Be sure to provide the following environment variables:

* `REDIS_HOST`: The hostname of a Redis instance
* `CARINA_CP_URL`: The publicly-accessible URL of the Carina control panel API. In production, this is `https://app.getcarina.com/api`.

```bash
docker run -d \
--name docker-control \
-e REDIS_HOST=${REDIS_HOST} \
-e CARINA_CP_URL=${CARINA_CP_URL} \
--restart unless-stopped \
docker-control
```
