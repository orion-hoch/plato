# Six CS 2800 lessons, two at a time: node run.mjs per topic; results as <tag>-<topic>.json here. bash batch.sh <tag> [turns]
cd "$(dirname "$0")"
T="${1:-run}" N="${2:-10}"
run() { node run.mjs "$1" "$2" "$T-$3.json" "$N" > "$T-$3.log" 2>&1; }
( run "Equivalence classes, the quotient" 12 eqclass; run "Covering, Hasse" 13 hasse; run "Diagonalization" 18 diag ) &
( run "^Injectivity" 14,15 inject; run "Strong induction and counting" 8 strong; run "Generalized pigeonhole" 16 pigeon ) &
wait
echo ALL DONE
