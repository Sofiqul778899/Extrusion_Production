import fs from "fs";
const run = async () => {
    try {
        const res = await fetch("http://localhost:3000/api/machines");
        const text = await res.text();
        console.log(text.substring(0, 500));
    } catch(e) { console.error(e); }
};
run();
