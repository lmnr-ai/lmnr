export async function GET() {
  try {
    const response = await fetch('https://api.github.com/repos/lmnr-ai/lmnr', {
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch stars', { cause: await response.text() });
    }

    const data = await response.json();
    return Response.json({ stars: data.stargazers_count });

  } catch (error) {
    console.error('Error fetching stars:', error);
    return Response.json({ error: 'Failed to fetch stars' }, { status: 500 });
  }
}
