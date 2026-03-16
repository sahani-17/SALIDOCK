import urllib.request, urllib.error
try:
    with urllib.request.urlopen('http://localhost:8000/api/interactions/2d/ebb73835-8b7c-4081-bc93-cf5f967668ea/1') as response:
        print(response.read().decode())
except urllib.error.HTTPError as e:
    print(e.read().decode())
