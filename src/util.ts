export function detectESM(): boolean {
    try {
        return !require
    } catch (err) {
        return true
    }
}
