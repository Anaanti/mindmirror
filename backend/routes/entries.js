// Create and left fetch video journal entries 
const express = require("express");
const router = express.Router();
const Entry = require("../models/Entry");

router.post("/",async (req, res)=>{
  
  try{
    const{title, videoUrl, tags} = req.body;
    // Reads title, videoUrl, and tags from the request bodydocumenr using the Mongoose Entry model
    const newEntry = new Entry({ title, videoUrl , tags});
    // and saves a new entry to the database
    await newEntry.save();
    // returns the newly created entry as a JSON response with a 201 status code
    res.status(201).json(newEntry);
  }
  catch(err){
    res.status(500).json({error: "Failed to create entry"});
  }
})

// fetch all entries from the database
router.get("/", async(req,res)=>{
  try{
    // finds all journal entries using Entry.find()
    // sorts them so latest entries come first by using sort({createdAt: -1})
    // and returns them as a JSON response
    const entries = await Entry.find().sort({createdAt: -1});
    res.json(entries);
  }catch(err){
    res.status(500).json({error: "Failed to fetch entry"})
  }
});

router.get("/:id", async(req, res) =>{
  try{
    // fetches a specific entry by its ID from the database
    const entry = await Entry.findById(req.params.id);
    // If the entry is not found, it returns a 404 status code with an error message
    if(!entry) return res.status(404).json({error:"Entry not found"});
    res.json(entry);
  }
  catch(err){
    res.status(500).json({error: "Failed to fetch entry"});
  }
});

module.exports = router;
