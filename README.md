# BoardInTheHouse

## Description

I was bored in the house
In the house bored
wrote a whiteboard that's remote
since we're all in the house bored
Board in the house
Board in the house
Board!

This is a collaborative multi-user vector-graphics whiteboard built with web sockets on top of fabricJS, designed for in-class use, remote problem solving sessions, and zoom office hours. 

## Features

+ Infinite Scroll / Zoom
+ Pressure sensitive stylus using the https://www.npmjs.com/package/@arch-inc/fabricjs-psbrush package
+ Streamlined interface for in-class use
+ image upload (cloudinary)
+ simple text notes
+ undo/redo
+ persistent boards saved to S3 through bucketeer
+ ready to deploy on heroku

Other features from fabricjs can be easily added with the message-based websockets interface.

## Run Locally

npm start

Navigating to the board will automatically create a new blank board.

 (image upload and persistent saving won't work when running locally unless you set-up the environment variables for cloudinary & bucketeer -- it's simple to add a local file storage mode though )

