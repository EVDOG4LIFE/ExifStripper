const sdk = require('node-appwrite');
const sharp = require('sharp');

module.exports = async function (req, res) {
  const client = new sdk.Client();
  const storage = new sdk.Storage(client);

  // Check for required environment variables
  const requiredEnvVars = [
    'APPWRITE_FUNCTION_ENDPOINT',
    'APPWRITE_FUNCTION_PROJECT_ID',
    'APPWRITE_FUNCTION_API_KEY'
  ];

  const missingEnvVars = requiredEnvVars.filter(varName => !req.variables[varName]);

  if (missingEnvVars.length > 0) {
    console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    return res.json({
      success: false,
      message: 'Server configuration error: Missing environment variables',
      details: `Missing variables: ${missingEnvVars.join(', ')}`
    });
  }

  // Client Init
  try {
    client
      .setEndpoint(req.variables['APPWRITE_FUNCTION_ENDPOINT'])
      .setProject(req.variables['APPWRITE_FUNCTION_PROJECT_ID'])
      .setKey(req.variables['APPWRITE_FUNCTION_API_KEY']);
  } catch (error) {
    console.error('Error setting up Appwrite client:', error);
    return res.json({
      success: false,
      message: 'Failed to initialize Appwrite client',
      error: error.message
    });
  }

  // Get the bucket ID and file ID from the event data
  const bucketId = req.payload.bucketId;
  const fileId = req.payload.fileId;

  if (!bucketId || !fileId) {
    console.error('Missing bucketId or fileId in payload');
    return res.json({
      success: false,
      message: 'Invalid event payload',
      details: 'Missing bucketId or fileId'
    });
  }

  try {
    // Download the file
    console.log(`Downloading file ${fileId} from bucket ${bucketId}`);
    const file = await storage.getFileDownload(bucketId, fileId);

    // Check if the file is an image
    const fileInfo = await storage.getFile(bucketId, fileId);
    if (!fileInfo.mimeType.startsWith('image/')) {
      console.warn(`File ${fileId} is not an image. Mime type: ${fileInfo.mimeType}`);
      return res.json({
        success: false,
        message: 'File is not an image',
        details: `Mime type: ${fileInfo.mimeType}`
      });
    }

    // Strip EXIF metadata using sharp
    console.log('Stripping EXIF metadata');
    const strippedBuffer = await sharp(file)
      .withMetadata(false)
      .toBuffer();

    // Upload the stripped file back to the same bucket
    console.log(`Updating file ${fileId} in bucket ${bucketId}`);
    await storage.updateFile(bucketId, fileId, strippedBuffer);

    // Return a success message
    console.log('EXIF metadata stripped successfully');
    return res.json({
      success: true,
      message: 'EXIF metadata stripped successfully',
      fileId: fileId,
      bucketId: bucketId
    });
  } catch (error) {
    console.error('Error processing image:', error);
    
    let errorDetails;
    if (error instanceof sdk.AppwriteException) {
      errorDetails = {
        code: error.code,
        type: error.type,
        response: error.response
      };
    } else {
      errorDetails = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    return res.json({
      success: false,
      message: 'Error processing image',
      error: error.message,
      details: errorDetails,
      fileId: fileId,
      bucketId: bucketId
    });
  }
};