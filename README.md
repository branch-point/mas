# MAS server and web app

MAS is a web group chat application with a sleek windowed UI.

_NOTE:_ The project is archived. Can't be recommended for any kind of general use.

For more info:

- [Architecture page](https://github.com/ilkkao/mas/wiki)
- [MAS client API](https://github.com/ilkkao/mas/blob/master/doc/MAS-client-API.md)

## Main features

- Windowed UI
- Messages can include mentions, links, emojis, markdown, images, and youtube videos
- Opt-in email alerts of missed messages
- Infinite scrolling to see older messages
- Another view to browse messages by group and date
- Contacts list with precense information
- Support for 1on1s, local groups and IRC channels (IRC backend implements RFC 2812)
- IRC connections are kept active also when the user is not logged in
- Separate mobile mode

## Dependencies

- Node.js: http://nodejs.org/
- Redis: http://redis.io/
- Elasticsearch: https://www.elastic.co/products/elasticsearch/ (optional)

## Development setup on Mac

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

4. Run the frontend

   ```bash
   $ cd new-client
   $ yarn run dev
   ```

## Production like setup

```bash
$ docker-compose up -d
```

When everything is running, navigate to `http://localhost/`. MAS frontend server is listening on port 80 on all interfaces.

Docker compose will create three data volumes. One of the is for the frontend server. Frontend server needs it to store uploaded files. Also if HTTPS is enabled, one option is to place the certs to this volume. In that case it's simplest to use a volume that is mounted from the host.
