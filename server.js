const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const qr = require("qrcode");
const sharp = require("sharp");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI);

// Define Schema for QR Code Data
const ContactSchema = new mongoose.Schema({
  fullName: String,
  role: String,
  description: String,
  phoneNumber: String,
  email: String,
  website: String,
  company: String,
  address: String,
  city: String,
  state: String,
  zip: String,
  country: String,
  linkedin: String,
  bgColor: String,
  image: String,
  qrCodeUrl: String,
});
const ContactData = mongoose.model("ContactData", ContactSchema);

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer (Store in memory, then upload to Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Home Page
app.get("/", (req, res) => {
  res.render("index", { qrImage: null });
});

// Function to Upload File to Cloudinary
const uploadToCloudinary = (fileBuffer, folder, resourceType) => {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType, folder },
        (error, result) => {
          if (error) {
            console.error("Cloudinary Upload Error:", error);
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );
      stream.end(fileBuffer);
    });
};


// Generate QR Code for PDF
app.post("/generate", upload.single("image"), async (req, res) => {
  const { fullName, role, phoneNumber, email, website, company, address, city, state, zip, country, linkedin, bgColor } = req.body;
  // Check if the image file exists
  if (!req.file) {
    return res.status(400).send("No image file uploaded.");
  }

  // Get buffer from uploaded image
  const imageBuffer = req.file.buffer;

  try {
    const imageUrl = await uploadToCloudinary(imageBuffer, "qr_images", "image");

    if (!imageUrl) {
      return res.status(500).send("File upload failed.");
    }

    // Create landing page URL
    const contactData = new ContactData({
      fullName: fullName.toUpperCase(), 
      role, 
      phoneNumber, 
      email, 
      website, 
      company, 
      address, 
      city, 
      state, 
      zip, 
      country, 
      linkedin,
      bgColor,
      image: imageUrl,
    });

    const savedData = await contactData.save();
    const landingPageUrl = `${req.protocol}://${req.get("host")}/view/${savedData._id}`;

    // Generate QR Code
    const qrImageData = await qr.toDataURL(landingPageUrl, { errorCorrectionLevel: 'H' });

    // Convert QR Code Image and Resize
    const qrBuffer = Buffer.from(qrImageData.split(',')[1], 'base64');
    const resizedQrBuffer = await sharp(qrBuffer).resize(500).png().toBuffer();

    // Upload QR Code Image to Cloudinary
    const qrCodeUrl = await uploadToCloudinary(resizedQrBuffer, "qr_codes", "image");

    // Update QR Code URL in MongoDB
    savedData.qrCodeUrl = qrCodeUrl;
    await savedData.save();

    // Render the page with QR Code
    res.render("index", { qrImage: qrImageData, qrDownload: qrCodeUrl });
  } catch (err) {
    console.error("Error generating QR code:", err);
    res.status(500).send("Error processing the request.");
  }
});

// Landing Page for Scanned QR Code
app.get("/view/:id", async (req, res) => {
  try {
    const data = await ContactData.findById(req.params.id);
    if (!data) {
      return res.status(404).send("Page not found.");
    }

    res.render("landing", {
      fullName: data.fullName, 
      role: data.role, 
      phoneNumber: data.phoneNumber, 
      email: data.email, 
      website: data.website, 
      company: data.company, 
      address: data.address, 
      city: data.city, 
      state: data.state, 
      zip: data.zip, 
      country: data.country, 
      linkedin: data.linkedin,
      bgColor: data.bgColor,
      image: data.image,
    });
  } catch (err) {
    console.error("Error retrieving landing page:", err);
    res.status(500).send("Error loading the page.");
  }
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
