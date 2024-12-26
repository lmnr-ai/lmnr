import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; rendererId: string } }
): Promise<NextResponse> {
  const { projectId, rendererId } = params;
  // TODO: implement with DB

  return NextResponse.json({
    html: `
<div id="visualization"></div>
<script>
  function onDataReceived(data) {
    const viz = document.getElementById('visualization');
    viz.innerHTML = \`
      <h2>Data: \${data}</h2>
    \`;
  }
  function onDataUpdated(data) {
    const viz = document.getElementById('visualization');
    viz.innerHTML = \`
      <h3>Updated data: \${data}</h3>
    \`;
  }
</script>`
  });
}
