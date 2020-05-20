# Allo

Visio conference WebRTC service limited to STUN.

## Setup and Run

```shell
# Install node packages
npm install

# Start the server
npm start
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

## Perfect Negociation

Perfect negociation is a pattern to handle perfectly
without glare (signaling collisions) changes in peer states.
With this pattern, we can simply call `pc.addTrack`
on one end and let it be perfectly handled on both ends.
A very useful blog post about perfect negociation is available at
https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/

The example is implemented in the WebRTC 1.0 updated spec:
https://w3c.github.io/webrtc-pc/#perfect-negotiation-example

That example is also detailed on MDN:
https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation

It seems however that the updated 1.0 API
(with new versions of `setLocalDescription`,
`setRemoteDescription` and `restartIce`)
is not implemented in Safari yet.
An equivalent version with the "old" WebRTC 1.0 spec
is available as a reference at the end of the first blog post.
