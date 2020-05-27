# Allo

Videoconference WebRTC example with an Elm frontend.
Requires https.
More info in the [post on Elm discourse][discourse].

![screenshots][screenshots]

[discourse]: https://discourse.elm-lang.org/t/elm-allo-a-webrtc-and-elm-videoconference-example/5809
[screenshots]: https://mpizenberg.github.io/resources/elm-allo/screenshots.jpg

## Setup and Run

```shell
# Install node packages
npm install

# Start the server
npm start
```

## Heroku setup

```shell
git clone https://github.com/mpizenberg/elm-allo.git
cd elm-allo
heroku login
heroku create
git push heroku master
```

## Nginx Reverse Proxy Configuration

```nginx
http {
	server { ... }
	server { ... }
	server {
		server_name subdomain.domain.com;
		location / {
			# Special treatment to handle WebSocket hop-by-hop headers
			proxy_http_version 1.1;
			proxy_set_header Upgrade $http_upgrade;
			proxy_set_header Connection "upgrade";

			# Standard proxy
			proxy_pass http://localhost:8443;
		}
		# ... stuff added by Certbot for SSL
	}
}
```

## WebRTC Negotiation

Establishing a connection between two peers requires first
a negotiation between each client.
The server has the broker's role by relaying all messages between those peers.

All the WebRTC-specific code, including negotiation,
is located in the `public/WebRTCClient.js` file.
A high-level API is provided with the `WebRTCCLient()` function.
Intermediate-level APIs are also provided with the `SignalingSocket()`
and `PeerConnection()` functions.
The core of the negotiation logic lives inside the `Peerconnection()` function.
Two negotiation algorithms are implemented, but only one is activated.

The first negotiation algorithm follows a simple caller/callee pattern.
It corresponds to the `simpleNegotiation()` function.

The second negotiation algorithm is called perfect negotiation.
Both peers are considered equally and it tries to handle peer changes of states
without glare (signaling collisions).
A [very useful blog post][perfect-negotiation] by Jan-Ivar Bruaroey
introduces the perfect negotiation pattern.
Unfortunately, [browsers still have some issues][not-so-perfect] preventing
the usage of this pattern so it has been deactivated in our code.
This corresponds to the `perfectNegotiation()` function.

[perfect-negotiation]: https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/
[not-so-perfect]: https://stackoverflow.com/questions/61956693/webrtc-perfect-negotiation-issues
