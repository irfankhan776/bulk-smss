const axios = require("axios");

const PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

/**
 * Search for businesses using Google Places Text Search.
 * Filters results that have a phone number but NO website = hot lead.
 *
 * @param {string} city      - City query, e.g. "Austin, TX"
 * @param {string} niche     - Business category, e.g. "barber", "plumber"
 * @param {string} apiKey    - Google Maps API key
 * @param {number} maxLeads  - Maximum number of leads to return
 * @returns {Promise<Array>}  - Array of { name, city, phone, website, placeId }
 */
async function searchBusinesses(city, niche, apiKey, maxLeads = 50) {
  const leads = [];
  let nextPageToken = null;

  while (leads.length < maxLeads) {
    const params = {
      query: `${niche} in ${city}`,
      key: apiKey,
    };
    if (nextPageToken) {
      params.pagetoken = nextPageToken;
      // Google requires a short delay between paginated requests
      await sleep(2000);
    }

    const res = await axios.get(PLACES_TEXT_SEARCH_URL, { params });
    const data = res.data;

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Google Places TextSearch error: ${data.status} — ${JSON.stringify(data)}`);
    }

    const results = data.results || [];
    if (results.length === 0) break;

    for (const place of results) {
      if (leads.length >= maxLeads) break;

      // Hot lead criteria: has a phone number AND no website (or website is empty/undefined)
      const hasPhone = place.formatted_phone_number || place.international_phone_number;
      const hasNoWebsite = !place.website;

      if (hasPhone && hasNoWebsite) {
        leads.push({
          name: place.name,
          city: city,
          phone: normalizePhone(place.formatted_phone_number || place.international_phone_number),
          website: place.website || null,
          placeId: place.place_id,
          address: place.formatted_address || null,
        });
      }
    }

    nextPageToken = data.next_page_token || null;
    if (!nextPageToken) break;
  }

  return leads;
}

/**
 * Get full place details including phone and website.
 * Useful when TextSearch doesn't return enough info.
 *
 * @param {string} placeId - Google Place ID
 * @param {string} apiKey  - Google Maps API key
 * @returns {Promise<Object>} - { name, phone, website, address, reviews }
 */
async function getPlaceDetails(placeId, apiKey) {
  const res = await axios.get(PLACES_DETAILS_URL, {
    params: {
      place_id: placeId,
      key: apiKey,
      fields: "name,formatted_phone_number,international_phone_number,website,formatted_address,reviews",
    },
  });

  const data = res.data;
  if (data.status !== "OK") {
    throw new Error(`Google Places Details error: ${data.status}`);
  }

  const place = data.result;
  return {
    name: place.name,
    phone: normalizePhone(place.formatted_phone_number || place.international_phone_number),
    website: place.website || null,
    address: place.formatted_address || null,
    reviews: (place.reviews || []).map((r) => ({
      rating: r.rating,
      text: r.text,
      author: r.author_name,
    })),
  };
}

/**
 * Normalize a phone number to E.164 format (+XXXXXXXXXXXX).
 * Handles US/Canada numbers primarily.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  // Strip everything except digits and leading +
  const digits = String(phone).replace(/[^\d+]/g, "");
  // If it already starts with +, return as-is if 10+ digits
  if (digits.startsWith("+")) {
    return digits.replace(/\D/g, "").startsWith("1") ? digits : `+1${digits.replace(/\D/g, "")}`;
  }
  // US/Canada: prepend +1
  const digitsOnly = digits.replace(/\D/g, "");
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }
  // Fallback: prepend +
  return `+${digitsOnly}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  searchBusinesses,
  getPlaceDetails,
  normalizePhone,
};
