import os
import urllib.request
import time

# Google Noto Emoji Animated WebP URL format:
# https://fonts.gstatic.com/s/e/notoemoji/latest/{hexcode}/512.webp

EMOTICONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'emoticons')

EMOJI_LIST = {
    "1f600": "grinning",
    "1f601": "beaming",
    "1f602": "joy",
    "1f923": "rofl",
    "1f603": "grinning_face_with_big_eyes",
    "1f604": "grinning_face_with_smiling_eyes",
    "1f605": "sweat_smile",
    "1f606": "laughing",
    "1f609": "wink",
    "1f60a": "blush",
    "1f60d": "heart_eyes",
    "1f618": "kissing_heart",
    "1f60b": "yum",
    "1f60e": "sunglasses",
    "1f914": "thinking",
    "1f610": "neutral_face",
    "1f611": "expressionless",
    "1f636": "no_mouth",
    "1f644": "rolling_eyes",
    "1f60f": "smirk",
    "1f62c": "grimacing",
    "1f62e": "open_mouth",
    "1f62f": "hushed",
    "1f621": "pout",
    "1f62d": "sob",
    "1f631": "scream",
    "1f633": "flushed",
    "1f634": "sleeping",
    "1f637": "mask",
    "1f922": "nauseated",
    "1f92e": "vomiting",
    "1f927": "sneezing",
    "1f973": "partying",
    "1f974": "woozy",
    "1f97a": "pleading",
    "2764": "heart",
    "2728": "sparkles",
    "1f525": "fire",
    "1f44d": "thumbs_up",
    "1f64f": "pray",
    "1f389": "party_popper",
    "1f680": "rocket",
    "1f4ab": "dizzy",
}

def download_emojis():
    if not os.path.exists(EMOTICONS_DIR):
        os.makedirs(EMOTICONS_DIR)
        print(f"Created directory: {EMOTICONS_DIR}")

    print(f"Starting download of {len(EMOJI_LIST)} emojis...")
    
    success_count = 0
    fail_count = 0

    for hexcode, name in EMOJI_LIST.items():
        url = f"https://fonts.gstatic.com/s/e/notoemoji/latest/{hexcode}/512.webp"
        filename = f"{hexcode}_{name}.webp"
        filepath = os.path.join(EMOTICONS_DIR, filename)

        print(f"Downloading {name} ({hexcode})...", end="", flush=True)
        
        try:
            # Use a custom User-Agent to avoid being blocked
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                with open(filepath, 'wb') as f:
                    f.write(response.read())
            print(" [OK]")
            success_count += 1
        except Exception as e:
            print(f" [FAILED] - {e}")
            fail_count += 1
        
        # Avoid hammering the server too hard
        time.sleep(0.1)

    print("-" * 30)
    print(f"Download complete!")
    print(f"Successfully downloaded: {success_count}")
    print(f"Failed: {fail_count}")
    print(f"Files saved to: {EMOTICONS_DIR}")

if __name__ == "__main__":
    download_emojis()
