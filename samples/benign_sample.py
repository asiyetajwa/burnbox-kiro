"""benign_sample.py: the control case for Burn Box. Writes one short note in its own folder."""
with open("notes.txt", "w") as f:
    f.write("Remember to pay the invoice.\n")
print("Saved notes.txt")
