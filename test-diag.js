import fs from "fs";
const run = async () => {
    try {
        const res = await fetch("http://localhost:3000/api/diag");
        const text = await res.text();
        console.log("DIAG:", text);

        const res2 = await fetch("http://localhost:3000/api/debug/firebase");
        console.log("DEBUG DB:", await res2.text());
    } catch(e) { console.error(e); }
};
run();
