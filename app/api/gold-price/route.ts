import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Replace YOUR_API_KEY with your actual key if you have one
    const API_KEY = 'goldapi-YOUR-KEY-HERE'; 
    
    const response = await fetch('https://www.goldapi.io/api/XAU/USD', {
      headers: {
        'x-access-token': API_KEY,
        'Content-Type': 'application/json'
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    const data = await response.json();

    // If the external API fails, we return these fallback prices 
    // so your app doesn't show blank/zeroes
    if (!data.price) {
      console.log("API limit reached or error, using fallback prices.");
      return NextResponse.json({
        gold: 2045.50,
        silver: 81.15,
        platinum: 895.00,
        palladium: 1040.00
      });
    }

    // Map the external data to your app's format
    return NextResponse.json({
      gold: data.price,
      silver: 23.15,    // You can add more fetch calls for these
      platinum: 895.00,
      palladium: 1040.00
    });

  } catch (error) {
    // If everything crashes, return safe default numbers
    return NextResponse.json({
      gold: 2000,
      silver: 23,
      platinum: 900,
      palladium: 1000
    });
  }
}