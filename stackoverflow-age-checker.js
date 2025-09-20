const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Calculate account age in human-readable format
function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt * 1000); // Unix timestamp to milliseconds
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years > 0 ? `${years} years, ${months} months` : `${months} months`;
}

// Calculate age in days
function calculateAgeDays(createdAt) {
  const now = new Date();
  const created = new Date(createdAt * 1000);
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Process user data into response format
function processUserData(user) {
  const totalPosts = (user.badge_counts?.gold || 0) + (user.badge_counts?.silver || 0) + (user.badge_counts?.bronze || 0);
  return {
    username: user.display_name,
    nickname: user.display_name,
    estimated_creation_date: new Date(user.creation_date * 1000).toLocaleDateString(),
    account_age: calculateAccountAge(user.creation_date),
    age_days: calculateAgeDays(user.creation_date),
    followers: user.reputation.toString(),
    total_posts: totalPosts,
    verified: user.is_employee ? 'Stack Overflow Employee' : 'Standard',
    description: user.about_me || 'N/A',
    region: user.location || 'N/A',
    user_id: user.user_id.toString(),
    avatar: user.profile_image || 'https://via.placeholder.com/50',
    estimation_confidence: 'High (exact match)',
    accuracy_range: 'Second-level (API provides precise timestamp)',
    profile_link: user.link || `https://stackoverflow.com/users/${user.user_id}`
  };
}

// Fetch Stack Overflow user profile by username
async function getStackOverflowProfileByUsername(username) {
  try {
    const response = await axios.get(`https://api.stackexchange.com/2.3/users?inname=${encodeURIComponent(username)}&site=stackoverflow`, {
      timeout: 5000,
      params: {
        filter: '!9YdnSIN18', // Custom filter for user_id, display_name, etc.
        pagesize: 5 // Limit to 5 matches
      }
    });
    return response.data.items;
  } catch (error) {
    console.error('Stack Exchange API Error (Username):', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
}

// Fetch Stack Overflow user profile by user_id
async function getStackOverflowProfileById(user_id) {
  try {
    const response = await axios.get(`https://api.stackexchange.com/2.3/users/${user_id}?site=stackoverflow`, {
      timeout: 5000,
      params: {
        filter: '!9YdnSIN18' // Same filter
      }
    });
    return response.data.items[0];
  } catch (error) {
    console.error('Stack Exchange API Error (User ID):', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('Stack Overflow User Age Checker API is running');
});

// Stack Overflow username age checker endpoint (GET)
app.get('/api/stackoverflow/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  // Validate username (1-40 chars, letters/numbers/spaces/hyphens)
  if (!/^[a-zA-Z0-9\s-]{1,40}$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format. Stack Overflow usernames must be 1-40 characters using letters, numbers, spaces, or hyphens.' });
  }

  try {
    const users = await getStackOverflowProfileByUsername(username);

    if (!users || users.length === 0) {
      return res.status(404).json({ error: `Stack Overflow user ${username} not found` });
    }

    // Single match: Return user details
    if (users.length === 1) {
      const userData = processUserData(users[0]);
      return res.json(userData);
    }

    // Multiple matches: Return array with disambiguation note
    const processedUsers = users.map(user => ({
      ...processUserData(user),
      estimation_confidence: 'Medium (multiple matches found)'
    }));
    res.json({
      users: processedUsers,
      note: 'Multiple users found with similar names. Use the user_id or profile_link to select the correct user.'
    });
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 400) {
      return res.status(404).json({ error: `Stack Overflow user ${username} not found or inaccessible` });
    }

    console.error('Stack Exchange API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch Stack Overflow data',
      details: error.response?.data || 'No additional details'
    });
  }
});

// Stack Overflow user_id age checker endpoint (GET)
app.get('/api/stackoverflow/id/:user_id', async (req, res) => {
  const { user_id } = req.params;
  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Validate user_id (positive integer)
  if (!/^[1-9]\d*$/.test(user_id)) {
    return res.status(400).json({ error: 'Invalid user ID format. Must be a positive integer.' });
  }

  try {
    const user = await getStackOverflowProfileById(user_id);

    if (!user) {
      return res.status(404).json({ error: `Stack Overflow user with ID ${user_id} not found` });
    }

    const userData = processUserData(user);
    res.json(userData);
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 400) {
      return res.status(404).json({ error: `Stack Overflow user with ID ${user_id} not found or inaccessible` });
    }

    console.error('Stack Exchange API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch Stack Overflow data',
      details: error.response?.data || 'No additional details'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Stack Overflow User Age Checker Server running on port ${port}`);
});
