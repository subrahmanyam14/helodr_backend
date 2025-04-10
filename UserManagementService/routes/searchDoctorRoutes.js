const express = require('express');
const router = express.Router();
const { searchDoctors, getSimilarDoctors, getLocationSuggestions } = require('../controllers/searchDoctorController');
const auth = require('../middleware/auth');

/**
 * @route   GET /api/search/doctors
 * @desc    Search for doctors by location and specialization
 * @access  Public
 */
router.get('/doctors', async (req, res) => {
  try {
    const {
      specialization,
      subspecialization,
      location,
      lat,
      lng,
      distance,
      page,
      limit,
      sort,
      online,
      languages,
      rating
    } = req.query;

    // Parse coordinates if provided
    let coordinates = null;
    if (lat && lng) {
      coordinates = [parseFloat(lng), parseFloat(lat)];
    }

    // Parse languages if provided
    let languageArray = [];
    if (languages) {
      languageArray = languages.split(',').map(lang => lang.trim());
    }

    const searchOptions = {
      specialization,
      subSpecialization: subspecialization,
      location,
      coordinates,
      maxDistance: distance ? parseFloat(distance) : 10,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      sortBy: sort || 'distance',
      onlineOnly: online === 'true',
      languages: languageArray,
      minRating: rating ? parseFloat(rating) : 0
    };

    const results = await searchDoctors(searchOptions);
    res.json(results);
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/search/doctors/similar/:id
 * @desc    Get similar doctors based on specialization
 * @access  Public
 */
router.get('/doctors/similar/:id', async (req, res) => {
  try {
    const doctorId = req.params.id;
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;
    
    const similarDoctors = await getSimilarDoctors(doctorId, limit);
    res.json(similarDoctors);
  } catch (error) {
    console.error('Similar doctors API error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/search/locations/suggest
 * @desc    Get location autocomplete suggestions
 * @access  Public
 */
router.get('/locations/suggest', async (req, res) => {
  try {
    const { q, limit } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const suggestions = await getLocationSuggestions(
      q,
      limit ? parseInt(limit) : 5
    );
    
    res.json(suggestions);
  } catch (error) {
    console.error('Location suggestions API error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;