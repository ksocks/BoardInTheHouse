const fabric = require('fabric').fabric
//import { PSBrush } from "@arch-inc/fabricjs-psbrush"
const PSBrush = require('@arch-inc/fabricjs-psbrush').PSBrush

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;



app.use(express.static(__dirname + '/public'));

let canvas = new fabric.StaticCanvas();
let canvas_1 = new fabric.StaticCanvas();

canvas.includeDefaultValues = false
canvas_1.includeDefaultValues = false

canvas.history = []
canvas.redohistory = []
canvas.nextObjID = 0
canvas.objectsByID = {}

function onConnection(socket){
  socket.emit('canvasdata',canvas.toJSON(['id']))

  socket.on('eraseBoard',  function() {

    canvas.history.push(['eraseBoard',canvas.toJSON(['id'])])
    canvas.redohistory = [] // clear redo history on new object

    canvas.clear()
    io.sockets.emit('canvasdata',canvas.toJSON(['id']))
  })

  socket.on('viewSync', function(data) {
    console.log(data)
    socket.broadcast.emit('viewSync', data)
  });

  socket.on('drawing', function(data) {
    console.log(data)
    socket.broadcast.emit('drawing', data)
  });
  socket.on('object:added', function(data) {
    //console.log(JSON.stringify(data))
    console.log(JSON.stringify(data).length)

    //  assign a unique object  id
    data.id = canvas.nextObjID
    canvas.nextObjID += 1

    canvas_1.loadFromJSON({'objects':[data]})
    canvas.add(canvas_1._objects[0])
    socket.broadcast.emit('object:added', data)

    canvas.history.push(['object:added', data.id])
    canvas.objectsByID[data.id] = canvas_1._objects[0]
    canvas.redohistory = [] // clear redo history on new object
  });

  //hacky, better to do an id search and delete, but we don't...

  socket.on('undo', function(data) {
    act = canvas.history.pop()
    if (act) {
      if (act[0]=='object:added') {
        if (act[1] in canvas.objectsByID) {
          canvas.remove(canvas.objectsByID[act[1]])
        }
      } else if (act[0]=='eraseBoard') {
        canvas.loadFromJSON(act[1])
        //reset  id
        canvas.forEachObject((o)=>console.log(o.id))
        canvas.forEachObject((o)=>canvas.objectsByID[o.id]=o)
      }

      canvas.redohistory.push(act)
      io.sockets.emit('canvasdata',canvas.toJSON(['id']))
    }
  })

  socket.on('redo', function(data) {
    act = canvas.redohistory.pop()
    if (act) {
      if (act[0]=='object:added') {
        if (act[1] in canvas.objectsByID) {
          canvas.add(canvas.objectsByID[act[1]])
        }
      }
      if (act[0]=='eraseBoard') {
        canvas.clear()
      }
      canvas.history.push(act)
      io.sockets.emit('canvasdata',canvas.toJSON())
    }
  })
}

io.on('connection', onConnection);

http.listen(port, () => console.log('listening on port ' + port));
