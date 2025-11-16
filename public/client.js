function formatCurrency(number) {
    let result = number.toLocaleString(document.documentElement.lang, { style: "currency", currency: "IDR" });
    result = result.replace(/IDR\s/, "Rp");
    return result;
}
   
function getLocalISOString() {
    const date = new Date();
    const offset = date.getTimezoneOffset()
    const offsetAbs = Math.abs(offset)
    const isoString = new Date(date.getTime() - offset * 60 * 1000).toISOString()
    return `${isoString.slice(0, -1)}${offset > 0 ? '-' : '+'}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`
}