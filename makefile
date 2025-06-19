.PHONY: run

run:
	@command=$(word 2,$(MAKECMDGOALS)); \
	action=$(word 3,$(MAKECMDGOALS)); \
	args=$(wordlist 4,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS)); \
	case $$command in \
		package|pkg) python scripts/package_engine.py $$args ;; \
		import|imp) python scripts/import_engine.py $$args ;; \
		update|upd) python scripts/update.py $$action $$args ;; \
		distribute|dist) \
			cd ./deployment/auto-installers && \
			./compiler.sh && \
			cd ../../ && \
			python scripts/distribute.py $$args ;; \
		*) echo "Available commands: package|pkg, import|imp, and update|upd."; exit 1 ;; \
	esac

%:
	@: