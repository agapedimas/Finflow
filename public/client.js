function formatCurrency(number) {
    let result = number.toLocaleString(document.documentElement.lang, { style: "currency", currency: "IDR" });
    result = result.replace(/IDR\s/, "Rp");
    return result;
}

function registerCurrencyInput(input) {
    input.addEventListener("focus", function() {
        this.value = this.value.replace(/[^0-9|.]/g, "");
        this.value = parseInt(this.value || 0) + "";
    });

    input.addEventListener("input", function () {
        this.value = this.value.replace(/[^0-9]/g, "");
    });

    input.addEventListener("blur", function() {
        this.value = formatCurrency(parseInt(this.value.replace(/[^0-9|.]/g, "")) || 0);
    });
}
   
function getLocalISOString() {
    const date = new Date();
    const offset = date.getTimezoneOffset()
    const offsetAbs = Math.abs(offset)
    const isoString = new Date(date.getTime() - offset * 60 * 1000).toISOString()
    return `${isoString.slice(0, -1)}${offset > 0 ? '-' : '+'}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`
}

// Thanks to: 
// https://stackoverflow.com/questions/1760629/how-to-get-number-of-rows-in-textarea-using-javascript/1761203#1761203
function getTextAreaNumberOfLines(element) {
    function calculateContentHeight(ta, scanAmount) {
        const origHeight = ta.style.height;
        const scrollHeight = ta.scrollHeight;
        const overflow = ta.style.overflow;
        let height = ta.offsetHeight;
        if (height >= scrollHeight) {
            ta.style.height = height + scanAmount + "px";
            ta.style.overflow = "hidden";
            if (scrollHeight < ta.scrollHeight) {
                while (ta.offsetHeight >= ta.scrollHeight) {
                    ta.style.height = (height -= scanAmount) + "px";
                }
                while (ta.offsetHeight < ta.scrollHeight) {
                    ta.style.height = height++ + "px";
                }
                ta.style.height = origHeight;
                ta.style.overflow = overflow;
                return height;
            }
        } else {
            return scrollHeight;
        }
    }

    const ta = element;
    const styles = window.getComputedStyle ? window.getComputedStyle(ta) : ta.currentStyle;
    if (styles.lineHeight === "normal") {
        throw new Error("Please set a fixed line-height css property to get the number of lines");
    }
    const taLineHeight = parseInt(styles.lineHeight, 10);
    const taHeight = calculateContentHeight(ta, taLineHeight);
    const numberOfLines = Math.floor(taHeight / taLineHeight);
    return numberOfLines;
}