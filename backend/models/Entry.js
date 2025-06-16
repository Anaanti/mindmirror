const mongoose = require("mongoose");

const entrySchema = new mongoose.Schema({
    title:{
      type: String,
      required: true,
    },
    videoUrl: {
      type: String,
      required: true,
    },
    tags:[String],
    createdAt: {
      type: Date,
      default: Date.now,
    }
})

module.exports = mongoose.model("Entry", entrySchema);