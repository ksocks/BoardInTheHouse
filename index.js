const fabric = require('fabric').fabric
//import { PSBrush } from "@arch-inc/fabricjs-psbrush"
const PSBrush = require('@arch-inc/fabricjs-psbrush').PSBrush

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
const uniqid=require('uniqid')
const querystring=require('querystring')



class sharedBoardManager {
  constructor() {
    this.boards = {} // boardid->sharedBoard mapping
    this.users = {}  // usersid->boardid mapping
  }

  getBoard(socket) {
    if (socket.id in this.users &&  this.users[socket.id] in this.boards) {
      return this.boards[this.users[socket.id]]
    } else {
      return undefined
    }
  }

  onJoin(socket,data) {
    if (!('boardid' in data)) { //todo: more validation
      return
    }

    if (!(data.boardid in this.boards)) { //  create new board
      this.boards[data.boardid] = new sharedBoard(data.boardid)
    }

    this.users[socket.id]=data.boardid

    let board = this.getBoard(socket)
    socket.join(data.boardid)
    board.onJoin(socket)

  }

  onEraseBoard(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onEraseBoard(socket,data)
    }
  }
  onViewSync(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onViewSync(socket,data)
    }
  }
  onObjectAdded(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onObjectAdded(socket,data)
    }
  }
  onUndo(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onUndo(socket,data)
    }
  }
  onRedo(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onRedo(socket,data)
    }
  }

}

class sharedBoard {

  constructor(boardid)  {
    this.canvas = new fabric.StaticCanvas(); // for keeping track of the canvas
    this.canvas_1 = new fabric.StaticCanvas(); // for creating new  objects that are received over sockets
    this.canvas.includeDefaultValues = false
    this.canvas_1.includeDefaultValues = false

    this.history = []
    this.redohistory = []
    this.nextObjID = 0 // to assign unique ids to all generated objects
    this.objectsByID = {}

    this.boardid = boardid
  }

  getRoom() {
    return io.in(this.boardid)
  }

  getNextID() {
    this.nextObjID += 1
    return this.nextObjID-1
  }

  onJoin(socket,data) {
    socket.emit('canvasdata',this.canvas.toJSON(['id']))
  }

  onEraseBoard(socket,data) {
    this.history.push(['eraseBoard',this.canvas.toJSON(['id'])])
    this.redohistory = [] // clear redo history on new action

    this.canvas.clear()
    this.getRoom().emit('canvasdata',this.canvas.toJSON(['id']))
  }

  onViewSync(socket,data) {
    socket.in(this.boardid).broadcast.emit('viewSync', data)
  }

  onObjectAdded(socket,data) {
    //console.log(JSON.stringify(data))
    //console.log(JSON.stringify(data).length) - measure uncompressed size

    data.id = this.getNextID()

    this.canvas_1.loadFromJSON({'objects':[data]})
    this.canvas.add(this.canvas_1._objects[0])
    socket.in(this.boardid).broadcast.emit('object:added', data)

    this.history.push(['object:added', data.id])
    this.objectsByID[data.id] = this.canvas_1._objects[0]
    this.redohistory = [] // clear redo history on new action
  }

  onUndo(socket,data) {
    let act = this.history.pop()
    if (act) {
      if (act[0]=='object:added') {
        if (act[1] in this.objectsByID) {
          this.canvas.remove(this.objectsByID[act[1]])
        }
      } else if (act[0]=='eraseBoard') {
        this.canvas.loadFromJSON(act[1])
        //reset  id
        this.canvas.forEachObject((o)=>console.log(o.id))
        this.canvas.forEachObject((o)=>this.objectsByID[o.id]=o)
      }

      this.redohistory.push(act)
      this.getRoom().emit('canvasdata',this.canvas.toJSON(['id'])) // could optimize by doing individual deletes on objects...  would need to sync client & serverside object ids
    }
  }

  onRedo(socket, data) {
    let act = this.redohistory.pop()
    if (act) {
      if (act[0]=='object:added') {
        if (act[1] in this.objectsByID) {
          this.canvas.add(this.objectsByID[act[1]])
        }
      }
      if (act[0]=='eraseBoard') {
        this.canvas.clear()
      }
      this.history.push(act)
      this.getRoom().emit('canvasdata',this.canvas.toJSON())
    }
  }
}

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {

  req.query['boardid']= req.query['boardid'] ? req.query['boardid'] : uniqid()

  //thispath = url.parse(req.url).pathname
  res.redirect('/board.html' + '?' + querystring.encode(req.query))
});



bm  = new sharedBoardManager()

function onConnection(socket) {
  socket.on('joinBoard', (data)=>bm.onJoin(socket,data))

  socket.on('eraseBoard',  (data)=>bm.onEraseBoard(socket,data))
  socket.on('viewSync',  (data)=>bm.onViewSync(socket,data))
  socket.on('object:added',  (data)=>bm.onObjectAdded(socket,data))
  socket.on('undo',  (data)=>bm.onUndo(socket,data))
  socket.on('redo',  (data)=>bm.onRedo(socket,data))
}

io.on('connection', onConnection);

http.listen(port, () => console.log('listening on port ' + port));
