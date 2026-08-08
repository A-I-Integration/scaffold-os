import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const size = parseInt(searchParams.get('size') || '200');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId erforderlich' }, { status: 400 });
    }

    const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app'}/aufmass/schritt6?id=${projectId}`;

    // SVG generieren
    const svg = await QRCode.toString(projectUrl, {
      type: 'svg',
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
