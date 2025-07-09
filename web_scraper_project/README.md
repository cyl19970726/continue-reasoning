# News Scraper

This Python script scrapes the top 20 news headlines from Hacker News and saves them to a `news_headlines.json` file.

## Requirements
- Python 3.x
- requests
- BeautifulSoup4

## Installation
```
pip install -r requirements.txt
```

## Usage
```
python news_scraper.py
```

The results will be saved in `news_headlines.json`.

## Features
- Error handling and retry mechanism
- User-Agent headers to avoid blocking
- Random delay to prevent rate-limiting
