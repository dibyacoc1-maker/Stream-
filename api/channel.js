import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Channel ID is required' });
  }
  
  try {
    // Vercel serverless functions run in a Node environment, so we can read the file system
    const streamsPath = path.join(process.cwd(), 'data', 'streams.json');
    const fileContents = fs.readFileSync(streamsPath, 'utf8');
    const streamsDb = JSON.parse(fileContents);
    
    const channelData = streamsDb[id];
    
    if (!channelData) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    return res.status(200).json(channelData);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error reading streams' });
  }
}