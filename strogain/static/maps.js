
/*
A Word of Caution:
==================

I am not one for fancy front-ends; I am decidedly a backend programmer. Fiddling
around with colors, icons, buttons etc bores me, and therefore I am bad at it –
or is it the other way round?  :-) 

But entering input data for statistics on golf rounds is best done by looking at
at map of a golf course and using a mouse to place the golf ball. So I googled
for Javascript frameworks which are easy to use, found Vue.js and put it to work.
My understanding of Vue deepened while using it, but up to now I've been too lazy
to straighten out the errors I made while putting together the first draft. Thus
a lot of the code below is still just that: draft quality. But it would need a
string of extremely rainy evenings for me to motivate to refactor this...
*/

// ===========================================================================
// === Leaflet map
// ===========================================================================

var mymap = L.map('mapid', zoomSnap=0.25, scrollWheelZoom=false, touchZoom=false)
mymap.setView([48.270833, 11.753086], 18);
mymap.scrollWheelZoom.disable() // don't know why I have to set it explicitly
mymap.on('click', onMapClick);  // set an on-click manager to set shot markers

function makePinMarker() { // non-standard marker for pins (on the greens)
  return new L.Icon({
	//iconUrl: '/static/marker-icon-2x-gold.png',
	iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
	shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
	iconSize: new L.Point(25, 41),
	iconAnchor: new L.Point(12, 41),
	popupAnchor: new L.Point(1, -34),
	shadowSize: new L.Point(41, 41)
  });
}
function makeDropMarker() { // non-standard marker for dropped balls
  return new L.Icon({
	iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
	shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
	iconSize: new L.Point(25, 41),
	iconAnchor: new L.Point(12, 41),
	popupAnchor: new L.Point(1, -34),
	shadowSize: new L.Point(41, 41)
  });
}
var topoStyles = { // topology styles for golf course features
  fairway:  {
	"color": "#55aa55",
	"weight": 1,
	"opacity": 1,
	"fillOpacity": 0.4
  },
  green:  {
	"color": "#88cc88",
	"weight": 1,
	"opacity": 1,
	"fillOpacity": 0.4
  },
  bunker:  {
	"color": "#bbbb66",
	"weight": 1,
	"opacity": 1,
	"fillOpacity": 0.4
  },
  teebox: {
	radius: 2,
	fill: true,
	weight: 1,
	color: "#ccc",
	fillOpacity: 0.7,
	pane: 'shadowPane'
  }
}
function circleStyle(r) { // we draw distance-circles around the pins
  return {
	radius: r,
	fill: false,
	weight: 1,
	color: "#558",
	pane: 'shadowPane',
	dashArray: "4 3"
  }
}

L.esri.basemapLayer('Imagery').addTo(mymap)

/*var HikeBike_HikeBike = L.tileLayer('https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png', {
	maxZoom: 19,
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
*/

/*
var OpenTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
	maxZoom: 17,
	attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
});

 */

//L.tileLayer( 'https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=03b450dc2a4f4410a01b866e15a91dfd', {
//    attribution: 'Map data &copy; Gravitystorm Limited',
//    maxZoom: 18
//}).addTo(mymap);


// ===========================================================================
// === Viex Store
// ===========================================================================

const store = new Vuex.Store({
  state: {
	gameDate: date_of_play,
    selectedHole: "1",
	game: { game: {} },  // stores game's strokes
	holeMeta: {},        // stores meta data about currently selected hole
	shotCount: 0,        // shot count on current hole, including stray shots
	lie: "T",            // lie for the next shot
	significantChange: 0, // signal to actions-vue (see below)
	layers: {},          // layers on top of map (TODO move out of Vuex store)
	topology: {          // geo-coords for features of the golf course
	  pin: undefined,
	  fairway: undefined,
	  bunkers: undefined,
	  green: undefined
	}
  },
  // --- Getters -------------------------------------------------------------
  getters: {
	shotTrack: state => () => { // current sequences of shots (current hole)
	  tracks = []
	  track = []
	  holeno = state.selectedHole
	  teeshot = pair2latlng(state.holeMeta.tees[tees_to_play])
	  track.push(teeshot)
	  gm = state.game
	  if (gm && gm.game && gm.game[holeno] && gm.game[holeno].strokes) {
		gm = state.game.game[holeno]
		// convert strokes array into sequences of shots
		gm.strokes.sort(compareStrokes) // first sort them by stroke sequence
		//console.log("loaded game strokes for hole #" + holeno + " = " + JSON.stringify(gm))
		gm.strokes.forEach(function (stroke, inx) {
		  if (stroke.lie == "D") { // dropped balls start a new sequence
			tracks.push(track)
			track = [stroke.to]    // this is the starting point for next sequence
		  } else {
			track.push(pair2latlng(stroke.to))
		  }
		})
	  }
	  tracks.push(track)
	  //console.log("getting SHOT TRACKS = " + JSON.stringify(tracks))
	  return tracks
	},
	lastShot: state => () => { // last shot on current hole; may be partial
	  holeno = state.selectedHole
	  gm = state.game
	  console.log("last shot has been requested")
	  if (gm && gm.game && gm.game[holeno]) {
		gm = state.game.game[holeno]
		if (gm && gm.strokes && gm.strokes.length > 0) {
		  gm.strokes.sort(compareStrokes)
		  return gm.strokes[gm.strokes.length-1]
		}
	  }
	  if (state.holeMeta.tees) {
		teeshot = state.holeMeta.tees[tees_to_play]
		return { lie: "T", stroke: 1, from: teeshot }
	  }
	  return {}
	}
  },
  // --- Mutations -----------------------------------------------------------
  mutations: {
    game(state, game) {
	  state.game = game
	  console.log("game found and loaded")
	  console.log("commit: game = " + JSON.stringify(game))
	  if (game.game[state.selectedHole]) {
		console.log("setting pin at " + JSON.stringify(game.game[state.selectedHole].pin))
		state.holeMeta.pin = game.game[state.selectedHole].pin
	  }
    },
	hole(state, holeInfo) {
	  state.selectedHole = holeInfo.hole
	  state.holeMeta = holeInfo.meta
	  //console.log("FW center of hole #" + holeInfo.hole + " = " + holeInfo.meta.center)
	  mymap.setView(holeInfo.meta.center, calcScaleFactor(holeInfo.meta.overall))
	  // clear visual map layers
	  store.commit('clearShotMarkersAndTrace')
	  if (state.layers.fairway) {
		mymap.removeLayer(state.layers.fairway)
	  }
	  if (state.layers.green) {
		mymap.removeLayer(state.layers.green)
	  }
	  if (state.layers.bunkers) {
		mymap.removeLayer(state.layers.bunkers)
	  }
	  if (state.layers.teebox) {
		mymap.removeLayer(state.layers.teebox)
	  }
	  if (state.layers.pin) {
		mymap.removeLayer(state.layers.pin)
	  }
	  gm = state.game
	  if (!gm.game[holeInfo.hole]) {
		g = { tee: tees_to_play, pin: holeInfo.meta.pin }
		gm.game[holeInfo.hole] = g
	  } else {
		holeInfo.meta.pin = gm.game[holeInfo.hole].pin
	  }
	},
	newStroke(state, stroke) {
	  if (!state.game.game[state.selectedHole].strokes) {
		state.game.game[state.selectedHole].strokes = []
	  }
	  state.game.game[state.selectedHole].strokes.push(stroke)
	  console.log("commit: new stroke = " + JSON.stringify(stroke))
	  state.significantChange++
	},
	undoStroke(state) {
	  state.game.game[state.selectedHole].strokes.pop()
	  console.log("commit: undo stroke")
	  state.significantChange++
	},
    topology(state, topo) {
	  if (topo && topo.fairway) {
		if (state.layers.fairway) {
		  mymap.removeLayer(state.layers.fairway)
		}
		state.topology.fairway = topo.fairway
		state.layers.fairway = L.geoJSON(state.topology.fairway, {
		  style: topoStyles.fairway,
		  pane: 'overlayPane'
		}).addTo(mymap)
	  }
	  if (topo && topo.green) {
		if (state.layers.green) {
		  mymap.removeLayer(state.layers.green)
		}
		state.topology.green = topo.green
		state.layers.green = L.geoJSON(state.topology.green, {
		  style: topoStyles.green,
		  pane: 'overlayPane'
		}).addTo(mymap);
	  }
	  if (topo && topo.teebox) {
		if (state.layers.teebox) {
		  mymap.removeLayer(state.layers.teebox)
		}
		//state.topology.teebox = topo.teebox
		teeshot = pair2latlng(state.holeMeta.tees[tees_to_play])
		state.layers.teebox = L.circle(teeshot, topoStyles.teebox)
		state.layers.teebox.addTo(mymap)
	  }
	  if (topo && topo.pin) {
		if (state.topology.pin) {
		  mymap.removeLayer(state.topology.pin)
		  if (state.layers.circle1m) {
			mymap.removeLayer(state.layers.circle1m)
			mymap.removeLayer(state.layers.circle3m)
		  }
		}
		state.topology.pin = topo.pin
		state.topology.pin.addTo(mymap)
		state.layers.circle3m = L.circle(state.holeMeta.pin, circleStyle(3))
		state.layers.circle1m = L.circle(state.holeMeta.pin, circleStyle(1))
		state.layers.circle3m.addTo(mymap) //state.layers.circle3m.bringToFront()
		state.layers.circle1m.addTo(mymap) //state.layers.circle1m.bringToFront()
	  }
	  if (topo && topo.bunkers) {
		if (state.topology.bunkers) {
		  mymap.removeLayer(state.topology.bunkers)
		}
		state.topology.bunkers = topo.bunkers
		state.layers.bunkers = L.layerGroup()
		mymap.addLayer(state.layers.bunkers)
		topo.bunkers.forEach(function(b, inx) {
		   L.geoJSON(b, {
			style: topoStyles.bunker,
		  }).addTo(state.layers.bunkers)
		})
	  }
	  if (topo && topo.trace) {
		if (state.layers.trace) {
		  mymap.removeLayer(state.layers.trace)
		}
		state.layers.trace = L.polyline(topo.trace, { color: '#ccf' }).addTo(mymap);
		state.layers.trace.bringToFront()
	  }
	  if (state.layers.trace) {
		state.layers.trace.bringToFront()
	  }
    },
	pinPosition(state, geopos) {
	  console.log("commit: pin position = " + geopos + " => " + latlng2pair(geopos))
	  state.game.game[state.selectedHole].pin = latlng2pair(geopos)
	  state.holeMeta.pin = latlng2pair(geopos)
	  last = store.getters.lastShot()
	  if (last.result == "H") {
		last.to = state.holeMeta.pin
		console.log("last hole-out is now " + JSON.stringify(last))
	  }
	},
	dropMovement(state, movement) {
	  shot = movement.shot
	  geopos = movement.loc
	  //console.log("update drop position for shot #" + shot + " to " + geopos)
	  gm = getGameForHole(holeno, state.game)
	  pos = latlng2pair(geopos)
	  let drop
	  gm.strokes.forEach(function(s, inx) {
		if (s.stroke == shot) {
		  s.from = pos
		  s.to   = pos
		  drop = s
		}
	  })
	  console.log("moved drop #" + drop.stroke + " = " + JSON.stringify(drop))
	},
	dropChangeLie(state, drop) {
	  shot = drop.shot
	  gm = getGameForHole(holeno, state.game)
	  gm.strokes.forEach(function(s, inx) {
		if (s.stroke == shot) { s.result = drop.lie }
	  })
	},
	clearShotMarkersAndTrace(state) {
	  if (state.layers.markers) {
		mymap.removeLayer(state.layers.markers)
	  }
	  state.layers.markers = L.layerGroup()
	  mymap.addLayer(state.layers.markers)
	  if (state.layers.trace) {
		mymap.removeLayer(state.layers.trace)
	  }
	},
	significant(state) {
	  state.significantChange++
	}
  },
  // --- Actions -------------------------------------------------------------
  actions: {
	init(context) { // golf course data is already present
	  firstTee = mycourse.course[0]
	  console.log("starting round at tee " + firstTee)
	  if (!firstTee) {
		alert("cannot determine first tee")
		firstTee = "1"
	  }
	  meta = mycourse.holes[firstTee]
	  context.commit('hole', { hole: firstTee, meta: meta })
	  // load additional course topology for first hole
	  context.dispatch('loadTopology', firstTee)
	  // load a game score, if already present
	  context.dispatch('loadScore') // will set pin marker and strokes
	},
	loadScore(context) {
	  axios.get('/game/' + context.state.gameDate)
		.then(function (response) {
		  if (response.data) {
			console.log("loaded game data")
			context.commit('game', response.data)
			context.dispatch('setPinMarker')
			context.dispatch('showStrokes', context.state.selectedHole)
		  } else {
			context.dispatch('setPinMarker')
		  }
		  context.commit('significant')
	  })
	  .catch(function (error) {
		alert(error)
	  })
	},
    loadTopology(context, holeno) {
	  hole = context.state.selectedHole
	  console.log('triggered loading of topology hole #' + hole)
	  context.commit('topology', { 'teebox': true })
      axios.get('/course/Open.9/fairway/' + hole)
        .then(function (response) {
		  console.log('loaded fairway data for hole ' + hole)
          context.commit('topology', { 'fairway': response.data })
        })
        .catch(function (error) {
          alert(error)
        })
      axios.get('/course/Open.9/green/' + hole, {
		  headers: { 'Access-Control-Allow-Origin': '*' }
		})
        .then(function (response) {
		  console.log('loaded green data for hole ' + hole)
          context.commit('topology', { 'green': response.data })
        })
        .catch(function (error) {
          alert(error)
        })
      axios.get('/course/Open.9/bunkers/' + hole, {
		  headers: { 'Access-Control-Allow-Origin': '*' }
		})
        .then(function (response) {
		  if (response.data) {
			context.commit('topology', { 'bunkers': response.data })
		  }
        })
        .catch(function (error) {
          alert(error)
        })
    },
	setPinMarker(context) {
	  pinmarker = createPinMarker(context)
	  console.log("pin marker created, now placing it")
	  context.commit('topology', { 'pin': pinmarker })
	},
	updatePinPosition(context, geopos) {
	  if (store.state.game) {
		gm = getGameForHole(store.state.selectedHole, store.state.game)
		if (gm) {
		  context.commit('pinPosition', geopos)
		} else {
		  alert("Error: no game for this hole; please create one")
		}
	  }
	},
	showStrokes(context, holeno) {
	  console.log("SHOW STROKES, hole = " + holeno)
	  context.commit('clearShotMarkersAndTrace')
	  gm = getGameForHole(holeno, context.state.game)
	  if (gm && gm.strokes) {
		gm.strokes.sort(compareStrokes)
		//gm.strokes.reverse().forEach(function(stroke, inx) {
		gm.strokes.forEach(function(stroke, inx) {
		  //console.log("setting marker #" + inx + " for " + JSON.stringify(stroke))
		  if (stroke.result === "H") { // final stroke = hole-out
			pinMarker = context.state.topology.pin
			label = createLabelForMarker(context.state, stroke)
			console.log("hole-out, setting pin label to " + label)
			pinMarker.bindPopup(label)
			context.commit('topology', { pin: pinMarker })
		  } else {
			icon = getMarkerOptionForLie(stroke, stroke.result)
			//m = L.marker(stroke.to, {icon: L.Icon.Default}).addTo(store.state.layers.markers)
			m = L.marker(stroke.to, icon).addTo(store.state.layers.markers)
			label = createLabelForMarker(store.state, stroke)
			//console.log("placed label [" + label + "]")
			m.bindPopup(label)
		  }
		})
	  }
	  context.commit('topology', { trace: context.getters.shotTrack() })
	},
    setShot(context, geopos) {
	  lastShot = context.getters.lastShot()
	  if (lastShot.to && lastShot.result === "H") {
		alert("Der Ball ist bereits im Loch,\nkeine weiteren Schläge möglich!")
		return
	  }
	  console.log("setting shot marker at " + geopos)
	  stroke = {}
	  if (!lastShot.to) {
		stroke = lastShot
	  } else {
		stroke.stroke = lastShot.stroke + 1
		stroke.from = lastShot.to
		stroke.lie = lastShot.result
	  }
	  stroke.to = latlng2pair(geopos)
	  stroke.result = checkLie(geopos, context.state.topology)
	  console.log("create stroke = " + JSON.stringify(stroke))
	  context.commit("newStroke", stroke)
	  label = createLabelForMarker(context.state, stroke)
	  marker = L.marker(geopos).addTo(context.state.layers.markers)
	  marker.bindPopup(label)
	  context.commit('topology', { trace: context.getters.shotTrack() })
	},
	holeOut(context) {
	  stroke = context.getters.lastShot()
	  console.log("last shot up to now = " + JSON.stringify(stroke))
	  if (stroke.result == "H") {
		console.log("hole already finished; cannot hole out")
		alert("Der Ball ist bereits im Loch,\nkeine weiteren Schläge möglich!")
		return
	  }
	  pin = context.state.holeMeta.pin
	  if (stroke.result) {     // if we already made a shot on this hole
		stroke = {             // create the final shot to the hole
		  stroke: stroke.stroke + 1,
		  lie: stroke.result,
		  from: stroke.to
		}
	  } // otherwise it's a hole-in-one
	  stroke.to = pin
	  stroke.result = "H"
	  context.commit("newStroke", stroke)
	  pinMarker = context.state.topology.pin
	  label = createLabelForMarker(context.state, stroke)
	  pinMarker.bindPopup(label)
	  context.commit('topology', {
		trace: context.getters.shotTrack(),
		pin: pinMarker
	  })
	},
	undoShot(context) {
	  lastShot = context.getters.lastShot()
	  if (!lastShot.result) {
		alert("Noch kein Schlag auf dieser Bahn;\nZurücknehmen nicht möglich!")
		return
	  }
	  context.commit("undoStroke")
	  context.dispatch('showStrokes', context.state.selectedHole)
	  if (lastShot.result == "H" && context.state.topology.pin) {
		context.state.topology.pin.bindPopup("Fahne")
	  }
	},
	changeToHole(context, hole) {
	  console.log("changing to hole #" + hole)
	  meta = mycourse.holes[hole]
	  context.commit('hole', { hole: hole, meta: meta })
	  context.dispatch('loadTopology', hole)
	  context.dispatch('setPinMarker')
	  context.dispatch('showStrokes', hole)
	},
	dropBall(context) {
	  lastShot = context.getters.lastShot()
	  if (!lastShot.result) {
		alert("Noch kein Schlag auf dieser Bahn;\nkein Anlass für einen Drop!")
		return
	  }
	  if (lastShot.lie == "D") {
		alert("Zwei Drops hintereinander können nicht eingegeben werden!")
		return
	  }
	  ballLocation = lastShot.to
	  shotno = lastShot.stroke + 1
	  mdrop = createDropMarker(context, ballLocation, shotno)
	  stroke = {
		stroke: shotno,
		lie: "D",
		result: lastShot.result, // may change later by moving marker
		from: lastShot.to,
		to: lastShot.to
	  }
	  context.commit('newStroke', stroke)
	  mdrop.addTo(context.state.layers.markers)
	},
	updateDropLie(context, movement) {
	  lie =  checkLie(movement.loc, context.state.topology)
	  console.log("dropped shot now has lie = " + lie)
	  context.commit('dropChangeLie', {
		shot: movement.shot,
		lie: lie
	  })
	}
  }
})

// ===========================================================================
// === Vue for map actions
// ===========================================================================

var selectHole = new Vue({
  el: '#strokes',
  store,
  delimiters: ["[[","]]"],
  data: {
    selectedHole: 1
  },
  computed: {
	lastShot: function() {
	  l = {}
	  if (store.state.significantChange) {
		l = store.getters.lastShot()
		console.log("last shot = " + JSON.stringify(l))
	  }
	  return l
	},
	holesOnCourse: function() {
	  return mycourse.course
	},
    tees: function() {
	  console.log("someone requested the tee colors")
      return mycourse.tees;
    }
  },
  methods: {
    selectHole: function(event) {
      console.log('Switching to Hole #' + this.selectedHole)
	  this.$store.dispatch('changeToHole', this.selectedHole)
    },
	holeOut: function(event) {
	  console.log("HOLE OUT")
	  this.$store.dispatch('holeOut')
	},
	undoShot: function(event) {
	  console.log("UNDO SHOT")
	  this.$store.dispatch('undoShot')
	},
	dropBall: function(event) {
	  console.log("DROP BALL")
	  this.$store.dispatch('dropBall')
	}
  }
})

// ===========================================================================
// ===
// ===========================================================================

function getGameForHole(holeno, game) {
  gm = game.game[holeno]
  if (gm) {
	return gm
  }
  return {}
}

function latlng2point(geopos) {
  return [ geopos.lng, geopos.lat ]
}

function pair2latlng(point) {
  //return { lat: point[0], lng: point[1] }
  return L.latLng(point[0], point[1])
}

function latlng2pair(geopos) {
  return [ geopos.lat, geopos.lng ]
}

function createLabelForMarker(state, stroke) {
  label = "Schlag #" + stroke.stroke
  if (stroke.lie == "D") {
	label = "Drop (#" + stroke.stroke + ")"
  } else {
	lie = stroke.result
	if (lie === "F") {
	  label += "<br>auf dem Fairway"
	} else if (lie === "G") {
	  label += "<br>auf dem Grün"
	} else if (lie === "B") {
	  label += "<br>im Bunker"
	} else if (lie === "H") {
	  label += "<br>eingelocht"
	}
  }
  p = 0
  dist = pair2latlng(stroke.from).distanceTo(stroke.to)
  if (dist < 100) p = 1
  if (dist > 0.01) {
	label += "<br>Distanz: " + dist.toFixed(p) + "m"
  }
  //label += "<br>Distanz: " + Math.round(pair2latlng(stroke.from).distanceTo(pair2latlng(stroke.to))) + "m"
  //label += "<br>Distanz: " + pair2latlng(stroke.from).distanceTo(stroke.to).toFixed(1) + "m"
  pin = state.holeMeta.pin
  //label += "<br>zur Fahne: " + Math.round(pair2latlng(stroke.to).distanceTo(pin))
  if (lie != "H") {
	label += "<br>zur Fahne: " + pair2latlng(stroke.to).distanceTo(pin).toFixed(1) + "m"
  }
  return label
}

function createPinMarker(context) {
  hole = context.state.selectedHole      // current hole to play
  standardPin = mycourse.holes[hole].pin // standard pin location from course metadata
  geopos = pair2latlng(standardPin)
  label = "Standard-Fahne<br>(Grünmitte)"
  if (context.state.game) {
	gm = getGameForHole(hole, context.state.game)
	if (gm && gm.pin) { // pin position was set explicitely for this round
	  geopos = pair2latlng(gm.pin)
	  label = "Fahne"
	}
  }
  console.log("creating pin marker at " + geopos)
  pm = makePinMarker()
  mpin = L.marker(geopos, { icon: pm, zIndexOffset: 1000, draggable: true })
  mpin.on('moveend', function(event) {
	console.log("PIN MOVED: " + JSON.stringify(event.target._latlng))
	context.dispatch('updatePinPosition', event.target._latlng)
	context.commit('topology', { 'pin': mpin })
	mpin.bindPopup("Fahne")
	context.dispatch('showStrokes', context.state.selectedHole) // for to-pin labels
  })
  mpin.bindPopup(label)
  return mpin
}

function createDropMarker(context, ballLoc, shot) {
  console.log("creating drop marker at " + ballLoc)
  ballLoc[0] += 0.00001
  ballLoc[1] += 0.00001
  geopos = pair2latlng(ballLoc)
  dm = makeDropMarker()
  mdrop = L.marker(geopos, { icon: dm, zIndexOffset: 1000, draggable: true })
  mdrop.on('moveend', function(event) {
	console.log("dropping spot moved: " + JSON.stringify(event.target._latlng))
	context.dispatch('updateDropLie', { shot: shot, loc: event.target._latlng })
	context.commit('dropMovement', { shot: shot, loc: event.target._latlng })
	context.dispatch('showStrokes', context.state.selectedHole) // for to-pin labels
  })
  mdrop.bindPopup("Drop (#" + shot + ")")
  return mdrop
}

function getMarkerOptionForLie(stroke, lie) {
  return {}
}

function checkLie(geopos, topology) {
  if (topology.green) {
	console.log("checking for shot placement on green")
	onGreen = isInArea(geopos, topology.green)
	console.log("on green = " + onGreen)
	if (onGreen) {
	  return "G"
	}
  }
  if (topology.fairway) {
	console.log("checking for shot placement in fairway")
	inFairway = isInArea(geopos, topology.fairway)
	console.log("in fairway = " + inFairway)
	if (inFairway) {
	  return "F"
	}
  }
  if (topology.bunkers) {
	console.log("checking for shot placement in bunkers")
	found = false
	for (b of topology.bunkers) {
	  inBunker = isInArea(geopos, b)
	  console.log("in bunker = " + inBunker)
	  if (inBunker) {
		return "B"
	  }
	}
  }
  return "R"
}

function onMapClick(e) {
    //console.log("You clicked the map at " + e.latlng);
	store.dispatch('setShot', e.latlng)
}

function shotDistance(geopos1, geopos2) {
  pt1 = latlng2point(geopos1)
  pt2 = latlng2point(geopos2)
  return gju.pointDistance({type: 'Point', coordinates: pt1}, {type: 'Point', coordinates: pt2})
}

function getPolygon(geojsonpath) {
  return geojsonpath.features[0].geometry.coordinates
}

function isInArea(geopos, geoarea) {
  pt = latlng2point(geopos)
  polygon = getPolygon(geoarea)
  inArea = gju.pointInPolygon({ "type": "Point", "coordinates": pt },
	  {"type":"Polygon", "coordinates": polygon })
  //console.log("in area = " + inArea)
  return inArea
}

function saveGame() {
  //if (confirm("Saving Game, ok?")) {
	gm = document.getElementById("game");
	if (gm) {
	  console.log("returning game data")
	  gm.value = JSON.stringify(store.state.game)
	  return true
	}
  //}
  return false
}

// Shorter holes are zoomed in more than longer holes
function calcScaleFactor(fwLen) {
  if (fwLen > 190) { // this is 190 meters
	return 17        // zoom in
  }
  return 18
}

// Helper for sorting strokes
function compareStrokes(a, b) {
  if (a.stroke < b.stroke) {
    return -1;
  }
  if (a.stroke > b.stroke) {
    return 1;
  }
  return 0;
}
