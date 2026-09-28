const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function createPdf() {
  try {
    const img1Path = 'C:\\Users\\Manas\\.gemini\\antigravity\\brain\\7248d7b3-63ef-420c-852b-fae1f63371ce\\media__1789800532708.png';
    const img2Path = 'C:\\Users\\Manas\\.gemini\\antigravity\\brain\\7248d7b3-63ef-420c-852b-fae1f63371ce\\media__1789800829280.png';
    
    // Choose the document image (the second one)
    const imgPath = img2Path; 
    
    const imageBytes = fs.readFileSync(imgPath);
    
    const pdfDoc = await PDFDocument.create();
    
    const image = await pdfDoc.embedPng(imageBytes);
    
    const { width, height } = image;
    
    // A4 size is roughly 595.28 x 841.89 points
    const a4Width = 595.28;
    const a4Height = 841.89;
    
    const page = pdfDoc.addPage([a4Width, a4Height]);
    
    // scale to fit width
    const scale = a4Width / width;
    const scaledHeight = height * scale;
    
    // Center it vertically if it doesn't cover the full height, otherwise stretch to fit
    page.drawImage(image, {
      x: 0,
      y: (a4Height - scaledHeight) / 2, // center vertically if shorter, otherwise it will just draw from bottom. Wait, if it's a document it should fit roughly A4. Let's just scale it exactly to A4
      width: a4Width,
      height: a4Height
    });
    
    const pdfBytes = await pdfDoc.save();
    
    fs.writeFileSync('C:\\Users\\Manas\\Desktop\\Oditech\\HR-management-sysytem\\frontend\\public\\Office_Order.pdf', pdfBytes);
    console.log('PDF created successfully at frontend/public/Office_Order.pdf');
  } catch (error) {
    console.error('Error creating PDF:', error);
  }
}

createPdf();
