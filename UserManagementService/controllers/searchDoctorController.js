const mongoose = require('mongoose');
const Doctor = require('./models/Doctor');
const Hospital = require('./models/Hospital');

/**
 * Advanced doctor search with location and specialization filtering
 * @param {Object} options Search parameters
 * @param {String} [options.specialization] Doctor specialization to filter by
 * @param {String} [options.subSpecialization] Doctor sub-specialization to filter by
 * @param {String} [options.location] Location name (city, state, etc.)
 * @param {Array} [options.coordinates] [longitude, latitude] coordinates
 * @param {Number} [options.maxDistance] Maximum distance in kilometers (default: 10)
 * @param {Number} [options.page] Page number for pagination (default: 1)
 * @param {Number} [options.limit] Results per page (default: 20)
 * @param {String} [options.sortBy] Sort field (default: 'distance')
 * @param {Boolean} [options.onlineOnly] Filter for doctors offering online consultations
 * @param {Array} [options.languages] Filter by languages spoken
 * @param {Number} [options.minRating] Minimum doctor rating
 * @returns {Object} Search results with pagination metadata
 */
async function searchDoctors(options = {}) {
  try {
    const {
      specialization,
      subSpecialization,
      location,
      coordinates,
      maxDistance = 10, // Default 10km radius
      page = 1,
      limit = 20,
      sortBy = 'distance',
      onlineOnly = false,
      languages = [],
      minRating = 0
    } = options;

    // Build base query
    const query = {};

    // Add specialization filter
    if (specialization) {
      query.specialization = new RegExp(specialization, 'i');
    }

    // Add sub-specialization filter
    if (subSpecialization) {
      query.subSpecializations = { $in: [new RegExp(subSpecialization, 'i')] };
    }

    // Add language filter
    if (languages.length > 0) {
      query.languages = { $in: languages };
    }

    // Add rating filter
    if (minRating > 0) {
      query['statistics.averageRating'] = { $gte: minRating };
    }

    // Add online consultation filter
    if (onlineOnly) {
      query['onlineConsultation.isAvailable'] = true;
    }

    // Add verification filter - only show verified doctors
    query['verification.status'] = 'verified';

    // Define aggregation pipeline
    const pipeline = [];

    // Step 1: Match base filters
    pipeline.push({ $match: query });

    // Step 2: Join with User collection to get user details
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails'
      }
    });

    // Step 3: Unwind user details
    pipeline.push({ $unwind: '$userDetails' });

    // Step 4: Join with Hospital collection to get hospital info
    pipeline.push({
      $lookup: {
        from: 'hospitals',
        localField: 'hospitalAffiliations.hospital',
        foreignField: '_id',
        as: 'hospitals'
      }
    });

    // Handle location-based search
    let locationQuery = null;

    // If coordinates are provided, find nearby hospitals
    if (coordinates && coordinates.length === 2) {
      // Find hospitals near the coordinates
      const nearbyHospitals = await Hospital.find({
        'address.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: coordinates
            },
            $maxDistance: maxDistance * 1000 // Convert km to meters
          }
        }
      }).select('_id');

      const hospitalIds = nearbyHospitals.map(h => h._id);
      
      // Add hospital filter to the pipeline
      if (hospitalIds.length > 0) {
        pipeline.push({
          $match: {
            'hospitalAffiliations.hospital': { $in: hospitalIds }
          }
        });
      }

      // Add distance calculation field
      pipeline.push({
        $addFields: {
          hospitalWithDistance: {
            $map: {
              input: '$hospitals',
              as: 'hospital',
              in: {
                hospital: '$$hospital',
                distance: {
                  $cond: {
                    if: { $gt: [{ $size: '$$hospital.address.coordinates' }, 0] },
                    then: {
                      $divide: [
                        {
                          $distance: {
                            point1: {
                              type: 'Point',
                              coordinates: coordinates
                            },
                            point2: {
                              type: 'Point',
                              coordinates: '$$hospital.address.coordinates'
                            }
                          }
                        },
                        1000 // Convert meters to kilometers
                      ]
                    },
                    else: 999999 // Default large distance if no coordinates
                  }
                }
              }
            }
          }
        }
      });

      // Add closest hospital and its distance
      pipeline.push({
        $addFields: {
          closestHospital: { $arrayElemAt: ['$hospitalWithDistance', 0] },
          distance: { $min: '$hospitalWithDistance.distance' }
        }
      });
    } 
    // If location name is provided, search by text
    else if (location) {
      // Find hospitals matching the location text
      const locationRegex = new RegExp(location, 'i');
      const locationMatch = {
        $or: [
          { 'address.city': locationRegex },
          { 'address.state': locationRegex },
          { 'address.pinCode': locationRegex }
        ]
      };

      const matchingHospitals = await Hospital.find(locationMatch).select('_id');
      const hospitalIds = matchingHospitals.map(h => h._id);

      // Add hospital filter to the pipeline
      if (hospitalIds.length > 0) {
        pipeline.push({
          $match: {
            'hospitalAffiliations.hospital': { $in: hospitalIds }
          }
        });
      }
    }

    // Step 5: Sort results
    if (sortBy === 'distance' && coordinates) {
      pipeline.push({ $sort: { distance: 1 } });
    } else if (sortBy === 'rating') {
      pipeline.push({ $sort: { 'statistics.averageRating': -1 } });
    } else if (sortBy === 'experience') {
      pipeline.push({ $sort: { experience: -1 } });
    } else {
      pipeline.push({ $sort: { 'statistics.averageRating': -1 } });
    }

    // Step 6: Project only needed fields
    pipeline.push({
      $project: {
        _id: 1,
        title: 1,
        specialization: 1,
        subSpecializations: 1,
        experience: 1,
        languages: 1,
        consultationFee: 1,
        onlineConsultation: 1,
        statistics: 1,
        user: 1,
        fullName: { $concat: [{ $ifNull: ['$title', ''] }, ' ', '$userDetails.firstName', ' ', '$userDetails.lastName'] },
        profileImage: '$userDetails.profileImage',
        hospitalAffiliations: 1,
        distance: { $ifNull: ['$distance', null] },
        closestHospital: { $ifNull: ['$closestHospital', null] }
      }
    });

    // Step 7: Count total results for pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: 'total' });
    const countResult = await Doctor.aggregate(countPipeline);
    const totalResults = countResult.length > 0 ? countResult[0].total : 0;

    // Step 8: Apply pagination
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    // Execute the query
    const doctors = await Doctor.aggregate(pipeline);

    return {
      doctors,
      pagination: {
        total: totalResults,
        page,
        limit,
        pages: Math.ceil(totalResults / limit)
      }
    };
  } catch (error) {
    console.error('Error in searchDoctors:', error);
    throw error;
  }
}

/**
 * Get recommendations for similar doctors
 * @param {String} doctorId ID of the current doctor
 * @param {Number} limit Number of recommendations to return
 * @returns {Array} Similar doctors
 */
async function getSimilarDoctors(doctorId, limit = 5) {
  try {
    const currentDoctor = await Doctor.findById(doctorId);
    if (!currentDoctor) {
      throw new Error('Doctor not found');
    }

    // Build recommendation query
    const query = {
      _id: { $ne: doctorId },
      specialization: currentDoctor.specialization,
      'verification.status': 'verified'
    };

    // Find doctors with same specialization
    const similarDoctors = await Doctor.find(query)
      .sort({ 'statistics.averageRating': -1 })
      .limit(limit)
      .populate('user', 'firstName lastName profileImage')
      .populate('hospitalAffiliations.hospital', 'name address.city');

    return similarDoctors;
  } catch (error) {
    console.error('Error in getSimilarDoctors:', error);
    throw error;
  }
}

/**
 * Get geo-based search autocomplete suggestions
 * @param {String} input User input text
 * @param {Number} limit Maximum number of suggestions
 * @returns {Array} Location suggestions
 */
async function getLocationSuggestions(input, limit = 5) {
  try {
    const query = { $text: { $search: input } };
    
    // Get unique location names from hospitals
    const suggestions = await Hospital.aggregate([
      { $match: query },
      { 
        $group: { 
          _id: null,
          cities: { $addToSet: '$address.city' },
          states: { $addToSet: '$address.state' }
        } 
      },
      {
        $project: {
          locations: { $concatArrays: ['$cities', '$states'] }
        }
      },
      { $unwind: '$locations' },
      { $match: { locations: { $ne: null, $ne: '' } } },
      { $limit: limit }
    ]);

    return suggestions.map(s => s.locations);
  } catch (error) {
    console.error('Error in getLocationSuggestions:', error);
    throw error;
  }
}

module.exports = {
  searchDoctors,
  getSimilarDoctors,
  getLocationSuggestions
};