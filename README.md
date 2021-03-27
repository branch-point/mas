# MAS server and web app

MAS is a web group chat application with a sleek windowed UI.

_NOTE:_ The project is in flux. Can't be recommended for any kind of general use.

For more info, see

- [Architecture page](https://github.com/ilkkao/mas/wiki)
- [MAS client API](https://github.com/ilkkao/mas/blob/master/doc/MAS-client-API.md)

## Main features

- Next generation windowed UI
- Messages can include mentions, links, emojis, markdown, images, and youtube videos
- Opt-in email alerts of missed messages
- Infinite scrolling to get older messages
- Another view to browse messages by group and date
- Contacts list with precense information
- Support for 1on1s, local groups and IRC channels (IRC backend implements RFC 2812)
- IRC connections are kept active also when the user is not logged in
- Separate mobile mode

## Status

TBD

## Dependencies

- Node.js: http://nodejs.org/
- Yarn: https://yarnpkg.com/
- Redis: http://redis.io/
- Elasticsearch: https://www.elastic.co/products/elasticsearch/ (optional)

## OS support

MacOS/Linux/Windows.

## Development setup

1. Install Redis, yarn, and latest release of node.js (version 7.6 or later is required)

   On Mac you can do this by installing first [Homebrew](http://brew.sh/) and then

   ```bash
   $ brew install node yarn redis
   ```

2. Build different components and install required npm modules using the dev script

   ```bash
   $ ./dev.sh build
   ```

3. Launch the server components and redis in foreground

   ```bash
   $ ./dev.sh start
   ```

4. Browse to `http://localhost:3200/` and register an account.

## Production like setup

First check `docker-compose.yml` file. To customize your installation, add [default configuration value](https://github.com/ilkkao/mas/blob/master/server/mas.conf.default) overrides
to that file as new environment variables. Then you are ready launch the stack:

```bash
$ docker-compose up -d
```

When everything is running, navigate to `http://localhost/`. MAS frontend server is listening on port 80 on all interfaces.

Docker compose will create three data volumes. One of the is for the frontend server. Frontend server needs it to store uploaded files. Also if HTTPS is enabled, one option is to place the certs to this volume. In that case it's simplest to use a volume that is mounted from the host.

## Feedback

iao@iki.fi

[meetandspeak.com]: http://meetandspeak.com/
