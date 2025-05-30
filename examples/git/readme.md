```
# 直接通过管道传递diff内容
echo "--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 Line 1
-Line 2 Old
+Line 2 New
 Line 3" | git apply
```

```
git apply - << 'EOF'
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 Line 1
-Line 2 Old
+Line 2 New
 Line 3
EOF
```

```
(base) hhh0x@hhhdeMacBook-Pro git % echo -e "Line 1\nLine 2 Old\nLine 3" > test_file.txt
(base) hhh0x@hhhdeMacBook-Pro git % cat test_file.txt 
Line 1
Line 2 Old
Line 3
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % git apply test.patch && cat test_file.txt
error: can't open patch 'examples/git/test.patch': No such file or directory
(base) hhh0x@hhhdeMacBook-Pro git % echo -e "--- a/test_file.txt\n+++ b/test_file.txt\n@@ -1,3 +1,3 @@\n Line 1\n-Line 2 Old\n+Line 2 New\n Line 3" > test.patch
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % git apply test.patch && cat test_file.txt                                                                                   
Line 1
Line 2 New
Line 3
(base) hhh0x@hhhdeMacBook-Pro git % git apply --reverse test.patch
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % cat test_file.txt                        
Line 1
Line 2 Old
Line 3
(base) hhh0x@hhhdeMacBook-Pro git % git apply test.patch && cat test_file.txt                                                                                   
Line 1
Line 2 New
Line 3
(base) hhh0x@hhhdeMacBook-Pro git % cat test_file.txt                        
Line 1
Line 2 New
Line 3
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % 
(base) hhh0x@hhhdeMacBook-Pro git % git apply --reverse test.patch           
(base) hhh0x@hhhdeMacBook-Pro git % cat test_file.txt                        
Line 1
Line 2 Old
Line 3
```