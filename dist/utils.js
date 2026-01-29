export function distDegrees(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
export function centroid(points) {
    const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
    const lng = points.reduce((s, p) => s + p[1], 0) / points.length;
    return [lat, lng];
}
export function kmeansTwo(points, iters = 10) {
    let c1 = points[0];
    let c2 = points[points.length - 1];
    for (let iter = 0; iter < iters; iter++) {
        const g1 = [];
        const g2 = [];
        for (const p of points) {
            const d1 = distDegrees(p, c1);
            const d2 = distDegrees(p, c2);
            (d1 < d2 ? g1 : g2).push(p);
        }
        if (g1.length)
            c1 = centroid(g1);
        if (g2.length)
            c2 = centroid(g2);
    }
    return [c1, c2];
}
export function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
export function convexHull(points) {
    const pts = [...points].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const cross = (o, a, b) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
    const lower = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
            upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}
export function clusterPoints(points, radiusMeters) {
    const clusters = [];
    for (const p of points) {
        let placed = false;
        for (const c of clusters) {
            const dDeg = distDegrees(p, c.centroid);
            if (dDeg < radiusMeters / 111111) {
                c.points.push(p);
                c.centroid = centroid(c.points);
                placed = true;
                break;
            }
        }
        if (!placed)
            clusters.push({ points: [p], centroid: p });
    }
    return clusters.map(c => c.centroid);
}
