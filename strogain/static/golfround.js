//
// --- Vue --------------------------------------------------------------

var newRoundForm = new Vue({
  el: '#newround',
  //store,
  delimiters: ["[[","]]"],
  data: {
    selectedTees: "gelb"
  },
  computed: {
	selectableTees: function() {
	  console.log("someone requested the tee colors")
	  return { colors: [ "gelb", "rot" ] }
	}
  },
  methods: {
    selectTees: function(event) {
      console.log('Switching to Tees = ' + this.selectedTees)
    }
  }
})

// ----------------------------------------------------------------------
