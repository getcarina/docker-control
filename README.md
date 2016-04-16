# Docker Control

A simple REST-ish API that allows a Carina control panel user to interact with their clusters.

Behind the scenes, it uses the Carina control panel session ID to download the credentials bundle for the requested cluster and then proxy the request to the matching Docker remote API endpoint.
