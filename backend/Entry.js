const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  videoUrls: {
    type: String, // Array of video URLs
    required: false,
  },
  tags: {
    type: [String], // Array of tags
    default: [],
  }
}, {timestamps: true});

module.exports = mongoose.model('Entry', entrySchema);