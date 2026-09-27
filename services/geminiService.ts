/**
 * Extracts the odometer reading from a given base64 image string by calling the server-side API.
 */
export const extractOdometerReading = async (base64Image: string): Promise<number | null> => {
  try {
    const response = await fetch('/api/analyze-odometer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: base64Image }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error (${response.status})`);
    }

    const data = await response.json();
    if (data.mileage && typeof data.mileage === 'number' && data.mileage > 0) {
      return data.mileage;
    }
    return null;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
