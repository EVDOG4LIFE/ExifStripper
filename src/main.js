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

  // Parse the event data
  const eventDataString = req.variables['APPWRITE_FUNCTION_EVENT_DATA'];

  if (!eventDataString) {
    console.error('No event data received');
    return res.json({
      success: false,
      message: 'No event data received',
    });
  }

  const eventData = JSON.parse(eventDataString);

  const bucketId = eventData.bucketId;
  const fileId = eventData.$id;

  if (!bucketId || !fileId) {
    console.error('Missing bucketId or fileId in event data');
    return res.json({
      success: false,
      message: 'Invalid event data',
      details: 'Missing bucketId or fileId'
    });
  }

  try {
    // Download the file
    console.log(`Downloading file ${fileId} from bucket ${bucketId}`);
    const file = await storage.getFileDownload(bucketId, fileId);

    // Get file info, including permissions
    const fileInfo = await storage.getFile(bucketId, fileId);

    if (!fileInfo.mimeType.startsWith('image/')) {
      console.warn(`File ${fileId} is not an image. Mime type: ${fileInfo.mimeType}`);
      return res.json({
        success: false,
        message: 'File is not an image',
        details: `Mime type: ${fileInfo.mimeType}`
      });
    }

    // Strip EXIF metadata
    console.log('Stripping EXIF metadata');
    const strippedBuffer = await sharp(file)
      .withMetadata(false)
      .toBuffer();

    // Get existing permissions
    const readPermissions = fileInfo.$read;
    const writePermissions = fileInfo.$write;

    // Delete the existing file
    console.log(`Deleting original file ${fileId} from bucket ${bucketId}`);
    await storage.deleteFile(bucketId, fileId);

    // Upload the stripped file back with the same file ID and permissions
    console.log(`Uploading stripped file ${fileId} to bucket ${bucketId}`);
    await storage.createFile(
      bucketId,
      fileId,
      sdk.InputFile.fromBuffer(strippedBuffer, fileInfo.name),
      readPermissions,
      writePermissions
    );

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
